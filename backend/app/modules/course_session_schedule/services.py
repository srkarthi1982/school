from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.course.models import CourseInstance
from app.modules.profile.models import Profile

# Reuse the selection module's pure helpers (they take a CourseInstance, not a
# schedule type) plus its hub lookup as the COPY SOURCE.
from app.modules.course_selection_schedule.services import (
    _calendar_of,
    _derive_config,
    _lesson_catalogue,
    _parse_int_csv,
    _parse_str_csv,
    _valid_lesson_ids,
    ensure_schedule_for_instance,
    schedule_status_of,
)
from app.modules.course_selection_schedule.services import _get_hub as _selection_hub

from app.modules.course_session_schedule.models import (
    CourseSessionSchedule,
    CourseSessionScheduleDay,
    CourseSessionSchedulePlacement,
)
from app.modules.course_session_schedule.schemas import (
    MIN_DURATION_MINUTE,
    SessionPlacementItem,
    SessionScheduleDayItem,
    SessionScheduleDetailResponse,
    SessionScheduleMeta,
    SessionScheduleUpsert,
)

_VALID_STATUSES = ("created", "draft", "complete")

# Minutes in a day — placements are clamped into [0, 1440).
_MINUTES_PER_DAY = 24 * 60


def _hhmm_to_minute(value: str | None) -> int:
    """'08:00' -> 480. Falls back to 8:00 (480) on missing/garbage input."""
    if not value:
        return 480
    try:
        h, m = value.split(":")
        return max(0, min(_MINUTES_PER_DAY - 1, int(h) * 60 + int(m)))
    except (ValueError, AttributeError):
        return 480


def _clamp_minute(value: int) -> int:
    """Clamp a start time into the day [0, 1440)."""
    try:
        v = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, min(_MINUTES_PER_DAY - 1, v))


def _clamp_duration(value: int) -> int:
    """A block is always at least MIN_DURATION_MINUTE long."""
    try:
        v = int(value)
    except (TypeError, ValueError):
        return MIN_DURATION_MINUTE
    return max(MIN_DURATION_MINUTE, v)


# ─── Lookups ────────────────────────────────────────────────────────────────

def _get_hub(db: Session, course: CourseInstance) -> CourseSessionSchedule | None:
    return (
        db.execute(
            select(CourseSessionSchedule).where(
                CourseSessionSchedule.course_instance_id == course.id
            )
        )
        .scalars()
        .first()
    )


def _is_approved(course: CourseInstance) -> bool:
    return (course.status or "").lower() == "approved"


def _stamp(hub: CourseSessionSchedule, user_id: int | None) -> None:
    """Mark the session schedule as user-modified (drives the keep/reset prompt)."""
    hub.last_modified_by = user_id
    hub.last_modified_at = datetime.now(timezone.utc)


def _parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _nth_available_date(
    index: int, start: date | None, off_weekdays: list[int], holidays: list[str]
) -> date | None:
    """Date of the ``index``-th (0-based) AVAILABLE day from ``start``, skipping
    off-weekdays (Mon=0 … Sun=6) and holiday ISO dates. Port of the frontend
    ``nthAvailableDate``. Returns None if ``start`` is unset."""
    if not start:
        return None
    offs = set(off_weekdays or [])
    hol = set(holidays or [])
    cur = start
    count = -1
    for _ in range(4000):
        if cur.weekday() not in offs and cur.isoformat() not in hol:
            count += 1
            if count == index:
                return cur
        cur = cur + timedelta(days=1)
    return None


# ─── Copy / fork from the selection (template) schedule ─────────────────────

def copy_selection_to_session(
    db: Session, course: CourseInstance, *, force: bool = False
) -> bool:
    """Fork the Course Selection (template) schedule into the session schedule.

    Idempotent: with ``force=False`` returns False when a session hub already
    exists (COPY ONCE — never clobber operational edits). With ``force=True``
    wipes and re-copies (the "Reset from template" action). NO lesson remap — the
    fork reuses the instance's own lessons. Per-day ``date`` is filled from the
    selection calendar via the available-day walk.
    """
    existing = _get_hub(db, course)
    if existing is not None and not force:
        return False

    selection = _selection_hub(db, course)

    if existing is not None:  # force reset
        hub = existing
        for d in list(hub.days):
            db.delete(d)
        db.flush()
        hub.start_date = selection.start_date if selection else None
        hub.off_weekdays = selection.off_weekdays if selection else None
        hub.holidays = selection.holidays if selection else None
    else:
        hub = CourseSessionSchedule(
            course_instance_id=course.id,
            start_date=selection.start_date if selection else None,
            off_weekdays=selection.off_weekdays if selection else None,
            holidays=selection.holidays if selection else None,
        )
        db.add(hub)
        try:
            db.flush()  # assign hub id for child day rows
        except IntegrityError:
            # A concurrent approval/heal created the hub first; the unique index
            # on course_instance_id rejects this insert. Reuse the existing row.
            db.rollback()
            if _get_hub(db, course) is not None:
                return False
            raise

    # Fresh fork → untouched by users.
    hub.last_modified_by = None
    hub.last_modified_at = None

    off = _parse_int_csv(hub.off_weekdays)
    hol = _parse_str_csv(hub.holidays)
    start = hub.start_date

    # The selection (template) is period-GRID based; the session is FREE-FORM time.
    # Convert each grid placement into clock minutes ONCE at fork time using the
    # course config. This only READS the selection — it never writes back to it.
    config = _derive_config(course)
    period = max(1, config.period_duration_minutes)
    day_start = _hhmm_to_minute(config.day_start_time)

    if selection is not None:
        for sd in selection.days:
            day = CourseSessionScheduleDay(
                order_index=sd.order_index,
                date=_nth_available_date(sd.order_index, start, off, hol),
            )
            for p in sd.placements:
                day.placements.append(
                    CourseSessionSchedulePlacement(
                        order_index=p.order_index,
                        lesson_id=p.lesson_id,
                        start_minute=_clamp_minute(day_start + (p.start_col or 0) * period),
                        duration_minute=_clamp_duration(max(1, p.span or 1) * period),
                        description=p.description,
                        remarks=p.remarks,
                    )
                )
            hub.days.append(day)

    db.commit()
    return True


def ensure_session_for_instance(
    db: Session, course: CourseInstance, user_id: int
) -> CourseSessionSchedule | None:
    """Return the session hub, healing it on first read for courses approved
    before this feature existed (ensure the template, then copy). Returns None
    when the course is not approved (no session schedule yet)."""
    hub = _get_hub(db, course)
    if hub is not None:
        return hub
    # Stopped courses remain viewable (read-only), so they may heal too.
    if (course.status or "").lower() not in ("approved", "stopped"):
        return None
    ensure_schedule_for_instance(db, course, user_id)
    copy_selection_to_session(db, course)
    return _get_hub(db, course)


def shift_session_days(
    db: Session,
    course: CourseInstance,
    stopped_at: date,
    gap_days: int,
    user_id: int | None,
) -> None:
    """Shift session days dated on/after ``stopped_at`` forward by ``gap_days``,
    re-landing each on the next available teaching day (skipping off-weekdays
    and holidays) so the first pending session moves to the resume day.

    Past sessions (dated before ``stopped_at``) keep their dates. Days without
    a stored date are materialized from the calendar walk first so they freeze
    or shift like everything else (the viewer prefers stored dates anyway).
    Flushes but does NOT commit — the caller owns the transaction.
    """
    hub = _get_hub(db, course)
    if hub is None or gap_days <= 0:
        return

    off = _parse_int_csv(hub.off_weekdays)
    offs = set(off)
    hol_list = _parse_str_csv(hub.holidays)
    hol = set(hol_list)

    days = sorted(hub.days, key=lambda d: d.order_index)

    for day in days:
        if day.date is None:
            day.date = _nth_available_date(day.order_index, hub.start_date, off, hol_list)

    prev: date | None = None
    for day in days:
        if day.date is None or day.date < stopped_at:
            continue
        candidate = day.date + timedelta(days=gap_days)
        # Original dates are strictly increasing (per _nth_available_date), but
        # the availability walk below can push an earlier day past the next
        # one's naive candidate — repair to keep dates strictly increasing.
        if prev is not None and candidate <= prev:
            candidate = prev + timedelta(days=1)
        for _ in range(4000):  # bounded like _nth_available_date
            if candidate.weekday() not in offs and candidate.isoformat() not in hol:
                break
            candidate = candidate + timedelta(days=1)
        day.date = candidate
        prev = candidate

    # Shifted dates are operational edits: stamp so a later re-approval raises
    # the keep/reset prompt instead of silently clobbering them.
    _stamp(hub, user_id)
    db.flush()


# ─── Serialize ──────────────────────────────────────────────────────────────

def _modified_by_name(db: Session, hub: CourseSessionSchedule | None) -> str | None:
    if hub is None or hub.last_modified_by is None:
        return None
    prof = db.get(Profile, hub.last_modified_by)
    return prof.full_name if prof else None


def serialize_schedule_detail(
    db: Session, course: CourseInstance
) -> SessionScheduleDetailResponse:
    config = _derive_config(course)
    hub = _get_hub(db, course)
    days = list(hub.days) if hub is not None else []
    return SessionScheduleDetailResponse(
        id=course.id,
        course_instance_id=course.id,
        course_title=course.title,
        course_date=course.start_date.isoformat() if course.start_date else None,
        status=schedule_status_of(course),
        available=hub is not None,
        config=config,
        calendar=_calendar_of(hub),
        lessons=_lesson_catalogue(course, config.periods_per_day),
        days=[
            SessionScheduleDayItem(
                id=day.id,
                day_label=None,
                date=day.date.isoformat() if day.date else None,
                items=[
                    SessionPlacementItem(
                        id=p.id,
                        lesson_id=p.lesson_id,
                        start_minute=p.start_minute,
                        duration_minute=p.duration_minute,
                        description=p.description,
                        remarks=p.remarks,
                    )
                    for p in day.placements
                ],
            )
            for day in days
        ],
        last_modified_by_name=_modified_by_name(db, hub),
        last_modified_at=(
            hub.last_modified_at.isoformat()
            if hub is not None and hub.last_modified_at
            else None
        ),
    )


def get_meta(db: Session, course: CourseInstance) -> SessionScheduleMeta:
    hub = _get_hub(db, course)
    return SessionScheduleMeta(
        exists=hub is not None,
        available=hub is not None,
        touched=hub is not None and hub.last_modified_at is not None,
        last_modified_by_name=_modified_by_name(db, hub),
        last_modified_at=(
            hub.last_modified_at.isoformat()
            if hub is not None and hub.last_modified_at
            else None
        ),
    )


# ─── Edits (operational; stamp last_modified) ───────────────────────────────

def _apply_calendar(hub: CourseSessionSchedule, cal) -> None:
    if cal is None:
        return
    hub.start_date = _parse_iso_date(cal.start_date)
    hub.off_weekdays = ",".join(str(int(w)) for w in cal.off_weekdays) or None
    hub.holidays = ",".join(h for h in cal.holidays if h) or None


def upsert_schedule(
    db: Session, course: CourseInstance, payload: SessionScheduleUpsert, user_id: int
) -> CourseInstance:
    """Full replace of session days + placements (+ per-day date + calendar).

    Deliberately does NOT write block-unit sizes / flight timing back to the
    instance lessons (unlike the selection upsert) — operational edits must not
    mutate the selection-visible lesson metadata."""
    if payload.status not in _VALID_STATUSES:
        raise HTTPException(
            status_code=400, detail=f"status must be one of {_VALID_STATUSES}"
        )

    valid_lessons = _valid_lesson_ids(course)

    hub = _get_hub(db, course)
    if hub is None:
        hub = CourseSessionSchedule(course_instance_id=course.id)
        db.add(hub)
        db.flush()

    for day in list(hub.days):
        db.delete(day)
    db.flush()

    for d_idx, day_in in enumerate(payload.days):
        day = CourseSessionScheduleDay(
            course_session_schedule_id=hub.id,
            order_index=d_idx,
            date=_parse_iso_date(day_in.date),
        )
        # Free-form: each block keeps its own start_minute/duration_minute. No
        # column packing, and overlaps are allowed (the client lays them out
        # side by side). Only the lesson-belongs-to-course guard remains.
        p_idx = 0
        for item in day_in.items:
            if item.lesson_id not in valid_lessons:
                continue
            desc = (item.description or "").strip() or None
            remarks = (item.remarks or "").strip() or None
            day.placements.append(
                CourseSessionSchedulePlacement(
                    order_index=p_idx,
                    lesson_id=item.lesson_id,
                    start_minute=_clamp_minute(item.start_minute),
                    duration_minute=_clamp_duration(item.duration_minute),
                    description=desc,
                    remarks=remarks,
                )
            )
            p_idx += 1
        hub.days.append(day)

    _apply_calendar(hub, payload.calendar)
    _stamp(hub, user_id)
    db.commit()
    return course


def move_placement(
    db: Session,
    course: CourseInstance,
    placement_id: int,
    day_index: int,
    start_minute: int,
    duration_minute: int,
    user_id: int,
) -> CourseInstance:
    """Relocate/resize ONE placement to a free-form time (Schedule Management
    teacher drag/resize). Only touches the session schedule — nothing is written
    back to the instance/selection schedule."""
    hub = _get_hub(db, course)
    if hub is None:
        raise HTTPException(status_code=404, detail="Schedule not found")

    placement = next(
        (p for d in hub.days for p in d.placements if p.id == placement_id), None
    )
    if placement is None:
        raise HTTPException(status_code=404, detail="Placement not found")

    target_day = next((d for d in hub.days if d.order_index == day_index), None)
    if target_day is None:
        raise HTTPException(status_code=400, detail="Invalid day index")

    placement.day = target_day
    placement.start_minute = _clamp_minute(start_minute)
    placement.duration_minute = _clamp_duration(duration_minute)
    _stamp(hub, user_id)

    db.commit()
    return course


def add_placement(
    db: Session,
    course: CourseInstance,
    lesson_id: int,
    day_index: int,
    start_minute: int,
    duration_minute: int,
    user_id: int,
) -> CourseInstance:
    """Add ONE new placement to the session schedule at a free-form time
    (Schedule Management add-lesson). The lesson must belong to the instance.

    This is purely operational: it writes ONLY to the session schedule tables and
    never syncs the new lesson back to the course instance / selection schedule."""
    hub = _get_hub(db, course)
    if hub is None:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if lesson_id not in _valid_lesson_ids(course):
        raise HTTPException(status_code=400, detail="Invalid lesson")

    target_day = next((d for d in hub.days if d.order_index == day_index), None)
    if target_day is None:
        raise HTTPException(status_code=400, detail="Invalid day index")

    next_order = max((p.order_index for p in target_day.placements), default=-1) + 1

    target_day.placements.append(
        CourseSessionSchedulePlacement(
            order_index=next_order,
            lesson_id=lesson_id,
            start_minute=_clamp_minute(start_minute),
            duration_minute=_clamp_duration(duration_minute),
        )
    )
    _stamp(hub, user_id)

    db.commit()
    return course


def remove_placement(
    db: Session,
    course: CourseInstance,
    placement_id: int,
    user_id: int,
) -> CourseInstance:
    """Delete ONE placement from the session schedule (Schedule Management teacher
    remove). Operational only — nothing is written back to the instance/selection
    schedule."""
    hub = _get_hub(db, course)
    if hub is None:
        raise HTTPException(status_code=404, detail="Schedule not found")

    placement = next(
        (p for d in hub.days for p in d.placements if p.id == placement_id), None
    )
    if placement is None:
        raise HTTPException(status_code=404, detail="Placement not found")

    db.delete(placement)
    _stamp(hub, user_id)

    db.commit()
    return course


def set_day_date(
    db: Session, course: CourseInstance, day_id: int, value: str | None, user_id: int
) -> CourseInstance:
    """Set one day row's real date (ISO yyyy-mm-dd, or null to clear)."""
    hub = _get_hub(db, course)
    if hub is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    day = next((d for d in hub.days if d.id == day_id), None)
    if day is None:
        raise HTTPException(status_code=404, detail="Day not found")
    if value and _parse_iso_date(value) is None:
        raise HTTPException(status_code=422, detail="Invalid date")
    day.date = _parse_iso_date(value)
    _stamp(hub, user_id)
    db.commit()
    return course
