from __future__ import annotations

import math

from fastapi import HTTPException, status

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.course_master.models import CourseMaster
from app.modules.schedule.models import (
    CourseScheduleDay,
    CourseSchedulePlacement,
)
from app.modules.schedule.schemas import (
    ScheduleConfig,
    ScheduleDayItem,
    ScheduleDetailResponse,
    ScheduleLessonItem,
    SchedulePlacementItem,
    ScheduleUpsert,
)

# Fallbacks used when Course Information hasn't supplied a value yet.
_DEFAULT_PERIODS_PER_DAY = 6
_DEFAULT_TOTAL_DAYS = 5
_DEFAULT_DAYS_PER_WEEK = 5
_DEFAULT_PERIOD_MINUTES = 45

_VALID_STATUSES = ("created", "draft", "complete")


def _pos(value, default: int) -> int:
    """Coerce a nullable/blank config value into a positive int (or default)."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return n if n > 0 else default


def _pos_float(value, default: float) -> float:
    """Like _pos but keeps fractions — training days/week may be e.g. 4.5."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    return n if n > 0 else default


# ─── Config + lesson catalogue, derived live from Course Information ─────────

def _derive_config(master: CourseMaster) -> ScheduleConfig:
    planning = master.lesson_planning
    general = master.general
    periods_per_day = _pos(
        getattr(planning, "number_of_periods_per_day", None), _DEFAULT_PERIODS_PER_DAY
    )
    return ScheduleConfig(
        periods_per_day=periods_per_day,
        total_training_days=_pos(
            getattr(general, "course_duration", None), _DEFAULT_TOTAL_DAYS
        ),
        training_days_per_week=_pos_float(
            getattr(planning, "number_of_training_days_per_week", None),
            _DEFAULT_DAYS_PER_WEEK,
        ),
        # Falls back to half the full day; never exceeds the full-day grid.
        periods_per_half_day=min(
            _pos(
                getattr(planning, "number_of_periods_per_half_day", None),
                max(1, (periods_per_day + 1) // 2),
            ),
            periods_per_day,
        ),
        period_duration_minutes=_pos(
            getattr(planning, "period_duration_minutes", None), _DEFAULT_PERIOD_MINUTES
        ),
    )


def _ncols_for_day(config: ScheduleConfig, day_index: int) -> int:
    """Usable period columns of a day row. A fractional training week (e.g.
    4.5) makes the LAST day of each week a half day capped at
    periods_per_half_day — day 5, day 10, … for 4.5 days/week."""
    if config.training_days_per_week % 1 == 0:
        return config.periods_per_day
    week_len = max(1, math.ceil(config.training_days_per_week))
    if day_index % week_len == week_len - 1:
        return max(1, min(config.periods_per_half_day, config.periods_per_day))
    return config.periods_per_day


def _lesson_catalogue(master: CourseMaster, periods_per_day: int) -> list[ScheduleLessonItem]:
    lesson_creation = master.lesson_creation
    if lesson_creation is None:
        return []
    items: list[ScheduleLessonItem] = []
    for lesson in lesson_creation.lessons:
        # flight_timing = TOTAL periods of the lesson (sum across all its blocks).
        # Display only — NOT clamped to the grid since a total may span days.
        total = max(1, _pos(lesson.flight_timing, 1))
        # Block-unit size: how wide ONE block is when placed. Falls back to the
        # total when unset in Lesson Creation, then clamped to fit a single day.
        unit = _pos(lesson.period_per_unit, 0) or total
        unit = max(1, min(unit, periods_per_day))
        items.append(
            ScheduleLessonItem(
                id=lesson.id,
                lesson_number=lesson.lesson_number,
                lesson_title=lesson.lesson_title,
                environment_label=lesson.environment.label if lesson.environment else None,
                period_type_label=lesson.period_type.label if lesson.period_type else None,
                periods=total,
                period_per_unit=unit,
            )
        )
    return items


def _valid_lesson_ids(master: CourseMaster) -> set[int]:
    lesson_creation = master.lesson_creation
    if lesson_creation is None:
        return set()
    return {lesson.id for lesson in lesson_creation.lessons}


# ─── Lookups / ensure ───────────────────────────────────────────────────────
#
# The Schedule category no longer has its own table. A course master *is* its
# schedule: the binary status lives in ``course_masters.schedule_completion``
# (100 -> "complete", else -> "created") and the day rows hang off
# ``course_master_id``. The ``schedule_id`` flowing through the API is the
# course master id (they are 1:1).

def get_or_raise_master(db: Session, course_master_id: int) -> CourseMaster:
    master = db.get(CourseMaster, course_master_id)
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found"
        )
    return master


def schedule_status_of(master: CourseMaster) -> str:
    """Derive the schedule status from the master's completion column.

    Status was historically a 3-value field (created/draft/complete) but only
    the "complete" bit was ever persisted (mirrored into ``schedule_completion``)
    and the UI only distinguishes complete vs not — so it collapses to binary.
    """
    return "complete" if master.schedule_completion >= 100 else "created"


def _load_days(db: Session, master: CourseMaster) -> list[CourseScheduleDay]:
    """Return the master's schedule day rows, ordered."""
    return list(
        db.execute(
            select(CourseScheduleDay)
            .where(CourseScheduleDay.course_master_id == master.id)
            .order_by(CourseScheduleDay.order_index)
        )
        .scalars()
        .all()
    )


def ensure_schedule_for_master(
    db: Session, master: CourseMaster, user_id: int
) -> CourseMaster:
    """Seed the master's schedule day rows if it has none yet.

    On first create the day rows are seeded from the course's configured
    training-day count (Course Information → General Information → duration).
    Idempotent — later calls leave existing day rows untouched.
    """
    existing = db.execute(
        select(CourseScheduleDay.id)
        .where(CourseScheduleDay.course_master_id == master.id)
        .limit(1)
    ).first()
    if existing:
        return master

    config = _derive_config(master)
    for i in range(max(1, config.total_training_days)):
        db.add(
            CourseScheduleDay(
                course_master_id=master.id,
                order_index=i,
                day_label=f"Day {i + 1}",
            )
        )
    master.updated_by_id = user_id
    db.commit()
    return master


# ─── Serialize ──────────────────────────────────────────────────────────────

def serialize_schedule_detail(
    db: Session, master: CourseMaster
) -> ScheduleDetailResponse:
    config = _derive_config(master)
    return ScheduleDetailResponse(
        id=master.id,
        course_master_id=master.id,
        course_title=master.title,
        course_date=master.course_date.isoformat() if master.course_date else None,
        status=schedule_status_of(master),
        config=config,
        lessons=_lesson_catalogue(master, config.periods_per_day),
        days=[
            ScheduleDayItem(
                id=day.id,
                day_label=day.day_label,
                items=[
                    SchedulePlacementItem(
                        id=p.id,
                        lesson_id=p.lesson_id,
                        start_col=p.start_col,
                        span=p.span,
                        description=p.description,
                        remarks=p.remarks,
                    )
                    for p in day.placements
                ],
            )
            for day in _load_days(db, master)
        ],
    )


# ─── Upsert (full replace of days + placements) ─────────────────────────────

def _apply_lesson_units(
    master: CourseMaster, payload: ScheduleUpsert, valid_lessons: set[int]
) -> None:
    """Write block-unit-size edits made on the schedule grid back to Lesson Creation.

    Resizing a block mirrors its new span onto the lesson's ``period_per_unit``
    (the default block size for future placements). Only resized lessons are
    sent. The lesson's TOTAL (flight timing) is handled separately — recomputed
    from the persisted placements in ``_recalc_lesson_totals``.
    """
    if not payload.lesson_units:
        return
    lesson_creation = master.lesson_creation
    if lesson_creation is None:
        return
    lessons_by_id = {lesson.id: lesson for lesson in lesson_creation.lessons}
    for entry in payload.lesson_units:
        if entry.lesson_id not in valid_lessons:
            continue
        lesson = lessons_by_id.get(entry.lesson_id)
        if lesson is not None:
            lesson.period_per_unit = max(1, entry.period_per_unit)


def _recalc_lesson_totals(
    master: CourseMaster, totals_by_lesson: dict[int, int]
) -> None:
    """Recompute each placed lesson's TOTAL (flight timing) from its blocks.

    ``totals_by_lesson`` maps lesson id → sum of the spans of every block of
    that lesson actually persisted on the grid. A lesson with no blocks is left
    untouched (its total stays at the last value).
    """
    lesson_creation = master.lesson_creation
    if lesson_creation is None:
        return
    for lesson in lesson_creation.lessons:
        total = totals_by_lesson.get(lesson.id)
        if total:
            lesson.flight_timing = max(1, total)


def upsert_schedule(
    db: Session,
    master: CourseMaster,
    payload: ScheduleUpsert,
    user_id: int,
) -> CourseMaster:
    if payload.status not in _VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"status must be one of {_VALID_STATUSES}",
        )

    config = _derive_config(master)
    valid_lessons = _valid_lesson_ids(master)

    # Full replace: placements carry no external FKs, so wipe-and-recreate is
    # safe and keeps the day order exactly as the client sent it. Deleting the
    # day rows cascades to their placements (ORM delete-orphan + DB CASCADE).
    for day in _load_days(db, master):
        db.delete(day)
    db.flush()  # apply the deletes before re-adding rows

    # Sum of every persisted block's span per lesson → the lesson's TOTAL
    # (flight timing). Built from the spans we actually store (after trimming).
    totals_by_lesson: dict[int, int] = {}

    for d_idx, day_in in enumerate(payload.days):
        day = CourseScheduleDay(
            course_master_id=master.id,
            order_index=d_idx,
            day_label=day_in.day_label,
        )
        # Track occupied columns so overlapping / out-of-bounds blocks are
        # silently trimmed rather than persisted in a broken state. Half days
        # (last day of each fractional week) hold fewer columns.
        ncols = _ncols_for_day(config, d_idx)
        occupied = [False] * ncols
        p_idx = 0
        for item in day_in.items:
            if item.lesson_id not in valid_lessons:
                continue
            start = max(0, min(item.start_col, ncols - 1))
            # free run from `start`, bounded by neighbours / grid end
            free = 0
            c = start
            while c < ncols and not occupied[c]:
                free += 1
                c += 1
            if free < 1:
                continue
            span = max(1, min(item.span, free))
            for c in range(start, start + span):
                occupied[c] = True
            totals_by_lesson[item.lesson_id] = totals_by_lesson.get(item.lesson_id, 0) + span
            desc = (item.description or "").strip() or None
            remarks = (item.remarks or "").strip() or None
            day.placements.append(
                CourseSchedulePlacement(
                    order_index=p_idx,
                    lesson_id=item.lesson_id,
                    start_col=start,
                    span=span,
                    description=desc,
                    remarks=remarks,
                )
            )
            p_idx += 1
        db.add(day)

    _apply_lesson_units(master, payload, valid_lessons)
    _recalc_lesson_totals(master, totals_by_lesson)

    # Mirror the binary status into the master's progress column. Status itself
    # is no longer persisted — it is derived from this column on read.
    master.schedule_completion = 100 if payload.status == "complete" else 0
    master.updated_by_id = user_id

    db.commit()
    return master
