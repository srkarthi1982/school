from __future__ import annotations

import re
import math
from datetime import date

from fastapi import HTTPException, status

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.course.models import (
    CourseEnrollment,
    CourseInstance,
    course_instructors,
)
from app.modules.course_selection_currencies_certificate.models import (
    CourseSelectionInfoFlightPackage,
)
from app.modules.schedule.models import CourseScheduleDay
from app.modules.course_selection_schedule.models import (
    CourseSelectionSchedule,
    CourseSelectionScheduleDay,
    CourseSelectionSchedulePlacement,
)
from app.modules.course_selection_schedule.schemas import (
    ScheduleCalendar,
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
_DEFAULT_DAY_START = "08:00"

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


# ─── Config + lesson catalogue, derived live from the instance's Course Info ─

def _derive_config(course: CourseInstance) -> ScheduleConfig:
    planning = course.course_info_lesson_planning
    general = course.course_info_general
    periods_per_day = _pos(
        getattr(planning, "number_of_periods_per_day", None), _DEFAULT_PERIODS_PER_DAY
    )
    start_time = getattr(general, "programmed_working_start_time", None)
    return ScheduleConfig(
        periods_per_day=periods_per_day,
        total_training_days=_pos(
            getattr(general, "course_duration", None), _DEFAULT_TOTAL_DAYS
        ),
        training_days_per_week=_pos_float(
            getattr(planning, "number_of_training_days_per_week", None),
            _DEFAULT_DAYS_PER_WEEK,
        ),
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
        day_start_time=start_time.strftime("%H:%M") if start_time else _DEFAULT_DAY_START,
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


def _instance_lesson_creation(course: CourseInstance):
    return course.course_info_lesson_creation


def _lesson_catalogue(course: CourseInstance, periods_per_day: int) -> list[ScheduleLessonItem]:
    lesson_creation = _instance_lesson_creation(course)
    if lesson_creation is None:
        return []
    items: list[ScheduleLessonItem] = []
    for lesson in lesson_creation.lessons:
        # flight_timing = TOTAL periods of the lesson (sum across all its blocks).
        total = max(1, _pos(lesson.flight_timing, 1))
        # Block-unit size: how wide ONE block is when placed. Falls back to the
        # total when unset, then clamped to fit a single day.
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


def _valid_lesson_ids(course: CourseInstance) -> set[int]:
    lesson_creation = _instance_lesson_creation(course)
    if lesson_creation is None:
        return set()
    return {lesson.id for lesson in lesson_creation.lessons}


# ─── Calendar (de)serialization ──────────────────────────────────────────────

def _parse_int_csv(raw: str | None) -> list[int]:
    if not raw:
        return []
    out: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(int(part))
        except ValueError:
            continue
    return out


def _parse_str_csv(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [p.strip() for p in raw.split(",") if p.strip()]


def _calendar_of(schedule: CourseSelectionSchedule | None) -> ScheduleCalendar:
    if schedule is None:
        return ScheduleCalendar()
    return ScheduleCalendar(
        start_date=schedule.start_date.isoformat() if schedule.start_date else None,
        off_weekdays=_parse_int_csv(schedule.off_weekdays),
        holidays=_parse_str_csv(schedule.holidays),
    )


# ─── Lookups / ensure ────────────────────────────────────────────────────────


def _build_full_name(first_name: str | None, middle_name: str | None, last_name: str | None) -> str:
    """Reconstruct the Profile.full_name computed property from mapped columns."""
    import re
    return re.sub(r'\s+', ' ', ' '.join([first_name or '', middle_name or '', last_name or '']).strip()) or ""


#
# The instance schedule keeps a 1:1 hub row (``course_selection_schedules``)
# that stores the calendar settings; day rows + placements hang off it. The
# ``schedule_id`` flowing through the API is the course INSTANCE id.

def get_or_raise_course(db: Session, course_instance_id: int) -> CourseInstance:
    course = db.get(CourseInstance, course_instance_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found"
        )
    return course


def schedule_status_of(course: CourseInstance) -> str:
    return "complete" if course.schedule_completion >= 100 else "created"


def require_course_membership(db: Session, course: CourseInstance, user) -> None:
    """Authorize a READ of this instance's schedule.

    Admins pass unconditionally; otherwise the user must be a member of this
    course — enrolled on it (student) or assigned to it (instructor). Used by the
    read-only GET endpoint so a student/teacher can only see their own courses'
    schedules. Imports are local to avoid any module load-order cycle.
    """
    from app.core.deps import has_permission
    from app.core.permissions import PermissionCode

    if has_permission(user, db, PermissionCode.ADMIN_FULL):
        return
    pid = getattr(getattr(user, "profile", None), "id", None)
    if pid is not None:
        enrolled = db.execute(
            select(CourseEnrollment.id)
            .where(
                CourseEnrollment.course_instance_id == course.id,
                CourseEnrollment.student_id == pid,
            )
            .limit(1)
        ).first()
        instructs = db.execute(
            select(course_instructors.c.course_instance_id)
            .where(
                course_instructors.c.course_instance_id == course.id,
                course_instructors.c.instructor_id == pid,
            )
            .limit(1)
        ).first()
        if enrolled or instructs:
            return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You don't have access to this course's schedule",
    )


def require_course_instructor(db: Session, course: CourseInstance, user) -> int | None:
    """Authorize a teacher-only action (e.g. releasing content to students).

    Admins pass unconditionally; otherwise the user must be an INSTRUCTOR of this
    course. Returns the user's profile id (or None for admins without a profile).
    """
    from app.core.deps import has_permission
    from app.core.permissions import PermissionCode

    pid = getattr(getattr(user, "profile", None), "id", None)
    if has_permission(user, db, PermissionCode.ADMIN_FULL):
        return pid
    if pid is not None:
        instructs = db.execute(
            select(course_instructors.c.course_instance_id)
            .where(
                course_instructors.c.course_instance_id == course.id,
                course_instructors.c.instructor_id == pid,
            )
            .limit(1)
        ).first()
        if instructs:
            return pid
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only instructors of this course can release content to students",
    )


def is_course_instructor(db: Session, course: CourseInstance, user) -> bool:
    """Non-raising check: is the user an instructor of this course (or admin)?

    Drives the lesson-detail "teacher" view (send to students). Membership-based,
    not role-name-based, so it's correct regardless of how roles are named."""
    from app.core.deps import has_permission
    from app.core.permissions import PermissionCode

    if has_permission(user, db, PermissionCode.ADMIN_FULL):
        return True
    pid = getattr(getattr(user, "profile", None), "id", None)
    if pid is None:
        return False
    return bool(
        db.execute(
            select(course_instructors.c.course_instance_id)
            .where(
                course_instructors.c.course_instance_id == course.id,
                course_instructors.c.instructor_id == pid,
            )
            .limit(1)
        ).first()
    )


_RELEASE_TYPES = {"quiz", "form", "survey"}
_TRACK_TYPES = {"lesson"}


def _require_profile_id(user) -> int:
    pid = getattr(getattr(user, "profile", None), "id", None)
    if pid is None:
        raise HTTPException(status_code=403, detail="No profile for this user")
    return pid


def _enrolled_student_ids(db: Session, course: CourseInstance) -> set[int]:
    """Profile ids of the students enrolled on this course instance."""
    return {
        row[0]
        for row in db.execute(
            select(CourseEnrollment.student_id).where(
                CourseEnrollment.course_instance_id == course.id
            )
        ).all()
    }


def _completed_student_ids(
    db: Session, course: CourseInstance, lesson_id: int, content_type: str, content_id: int
) -> set[int]:
    """Students who have already taken this content for this lesson. They can't be
    unsent, so a revoke must always leave their release row in place."""
    from .lesson_content_models import CourseSelectionLessonCompletion

    return {
        row[0]
        for row in db.execute(
            select(CourseSelectionLessonCompletion.student_id).where(
                CourseSelectionLessonCompletion.course_instance_id == course.id,
                CourseSelectionLessonCompletion.lesson_id == lesson_id,
                CourseSelectionLessonCompletion.content_type == content_type,
                CourseSelectionLessonCompletion.content_id == content_id,
            )
        ).all()
    }


def set_release_targets(
    db: Session,
    course: CourseInstance,
    lesson_id: int,
    content_type: str,
    content_id: int,
    student_ids: list[int],
    user,
) -> None:
    """Reconcile which students a quiz/form/survey is released to for a lesson.

    ``student_ids`` is the desired recipient set (profile ids). Students who've
    already taken the item are always kept (they can't be unsent). Any enrolled
    student newly listed gets a release row; any omitted, not-yet-taken student
    has theirs removed. Instructor-only. Idempotent.
    """
    from .lesson_content_models import CourseSelectionLessonRelease

    if content_type not in _RELEASE_TYPES:
        raise HTTPException(status_code=422, detail="Invalid content type")
    released_by = require_course_instructor(db, course, user)

    enrolled = _enrolled_student_ids(db, course)
    # Only enrolled students are valid targets; already-taken students are pinned
    # into the desired set so a revoke can never drop them.
    completed = _completed_student_ids(db, course, lesson_id, content_type, content_id) & enrolled
    desired = (set(student_ids) & enrolled) | completed

    current_rows = db.execute(
        select(CourseSelectionLessonRelease).where(
            CourseSelectionLessonRelease.course_instance_id == course.id,
            CourseSelectionLessonRelease.lesson_id == lesson_id,
            CourseSelectionLessonRelease.content_type == content_type,
            CourseSelectionLessonRelease.content_id == content_id,
        )
    ).scalars().all()
    current = {r.student_id: r for r in current_rows}

    changed = False
    for sid in desired - set(current):
        db.add(
            CourseSelectionLessonRelease(
                course_instance_id=course.id,
                lesson_id=lesson_id,
                content_type=content_type,
                content_id=content_id,
                student_id=sid,
                released_by=released_by,
            )
        )
        changed = True
    for sid, row in current.items():
        if sid not in desired:  # completed ⊆ desired, so this never drops them
            db.delete(row)
            changed = True
    if changed:
        db.commit()


def unrelease_content(
    db: Session, course: CourseInstance, lesson_id: int, content_type: str, content_id: int, user
) -> None:
    """Teacher revokes a release from every student who hasn't taken it yet
    (idempotent). Students who already took it keep their access + completion."""
    from .lesson_content_models import CourseSelectionLessonRelease

    require_course_instructor(db, course, user)
    completed = _completed_student_ids(db, course, lesson_id, content_type, content_id)
    rows = db.execute(
        select(CourseSelectionLessonRelease).where(
            CourseSelectionLessonRelease.course_instance_id == course.id,
            CourseSelectionLessonRelease.lesson_id == lesson_id,
            CourseSelectionLessonRelease.content_type == content_type,
            CourseSelectionLessonRelease.content_id == content_id,
        )
    ).scalars().all()
    changed = False
    for row in rows:
        if row.student_id not in completed:
            db.delete(row)
            changed = True
    if changed:
        db.commit()


def mark_completion(
    db: Session, course: CourseInstance, lesson_id: int, content_type: str, content_id: int, user
) -> None:
    """Student marks a released item as taken for this lesson (idempotent).

    Requires the item to be released; refuses otherwise so a student can't mark
    something the teacher hasn't sent."""
    from .lesson_content_models import (
        CourseSelectionLessonCompletion,
        CourseSelectionLessonRelease,
    )

    if content_type not in _RELEASE_TYPES:
        raise HTTPException(status_code=422, detail="Invalid content type")
    pid = _require_profile_id(user)
    released = db.execute(
        select(CourseSelectionLessonRelease.id).where(
            CourseSelectionLessonRelease.course_instance_id == course.id,
            CourseSelectionLessonRelease.lesson_id == lesson_id,
            CourseSelectionLessonRelease.content_type == content_type,
            CourseSelectionLessonRelease.content_id == content_id,
            CourseSelectionLessonRelease.student_id == pid,
        ).limit(1)
    ).first()
    if not released:
        raise HTTPException(
            status_code=403, detail="This item has not been released to you yet"
        )
    existing = db.execute(
        select(CourseSelectionLessonCompletion.id).where(
            CourseSelectionLessonCompletion.course_instance_id == course.id,
            CourseSelectionLessonCompletion.lesson_id == lesson_id,
            CourseSelectionLessonCompletion.content_type == content_type,
            CourseSelectionLessonCompletion.content_id == content_id,
            CourseSelectionLessonCompletion.student_id == pid,
        ).limit(1)
    ).first()
    if existing is None:
        db.add(
            CourseSelectionLessonCompletion(
                course_instance_id=course.id,
                lesson_id=lesson_id,
                content_type=content_type,
                content_id=content_id,
                student_id=pid,
            )
        )
        db.commit()


def _lesson_release_maps(
    db: Session, course: CourseInstance, lesson_id: int
) -> tuple[dict[tuple[str, int], set[int]], dict[tuple[str, int], set[int]]]:
    """Return (released_by_content, completed_by_content) maps for a lesson.

    Each maps (content_type, content_id) → the set of student profile ids that
    the item is released to / has been taken by. Only the quiz/form/survey
    content types are included (the lesson-level 'lesson' completion rows used by
    the roster tracker are excluded)."""
    from .lesson_content_models import (
        CourseSelectionLessonCompletion,
        CourseSelectionLessonRelease,
    )

    released_by_content: dict[tuple[str, int], set[int]] = {}
    for r in db.execute(
        select(
            CourseSelectionLessonRelease.content_type,
            CourseSelectionLessonRelease.content_id,
            CourseSelectionLessonRelease.student_id,
        ).where(
            CourseSelectionLessonRelease.course_instance_id == course.id,
            CourseSelectionLessonRelease.lesson_id == lesson_id,
        )
    ).all():
        released_by_content.setdefault((r.content_type, r.content_id), set()).add(r.student_id)

    completed_by_content: dict[tuple[str, int], set[int]] = {}
    for r in db.execute(
        select(
            CourseSelectionLessonCompletion.content_type,
            CourseSelectionLessonCompletion.content_id,
            CourseSelectionLessonCompletion.student_id,
        ).where(
            CourseSelectionLessonCompletion.course_instance_id == course.id,
            CourseSelectionLessonCompletion.lesson_id == lesson_id,
            CourseSelectionLessonCompletion.content_type.in_(tuple(_RELEASE_TYPES)),
        )
    ).all():
        completed_by_content.setdefault((r.content_type, r.content_id), set()).add(r.student_id)

    return released_by_content, completed_by_content


def _get_hub(db: Session, course: CourseInstance) -> CourseSelectionSchedule | None:
    return (
        db.execute(
            select(CourseSelectionSchedule).where(
                CourseSelectionSchedule.course_instance_id == course.id
            )
        )
        .scalars()
        .first()
    )


def _seed_from_master(
    db: Session, course: CourseInstance, schedule: CourseSelectionSchedule
) -> bool:
    """Copy the master's schedule (day rows + placements) into this instance.

    Block ``lesson_id`` is remapped from the master's Lesson Creation lesson to
    the instance's own lesson by matching ``order_index`` (the instance lessons
    are cloned from the master preserving order). Returns True if any master day
    rows were copied, False otherwise (caller then seeds empty day rows).
    """
    master = course.master
    if master is None:
        return False
    master_days = list(
        db.execute(
            select(CourseScheduleDay)
            .where(CourseScheduleDay.course_master_id == master.id)
            .order_by(CourseScheduleDay.order_index)
        )
        .scalars()
        .all()
    )
    if not master_days:
        return False

    master_lc = getattr(master, "lesson_creation", None)
    inst_lc = _instance_lesson_creation(course)
    master_id_to_order = (
        {l.id: l.order_index for l in master_lc.lessons} if master_lc else {}
    )
    order_to_inst_id = (
        {l.order_index: l.id for l in inst_lc.lessons} if inst_lc else {}
    )

    for md in master_days:
        day = CourseSelectionScheduleDay(order_index=md.order_index)
        for p in md.placements:
            order = master_id_to_order.get(p.lesson_id)
            inst_lesson_id = order_to_inst_id.get(order) if order is not None else None
            if inst_lesson_id is None:
                continue
            day.placements.append(
                CourseSelectionSchedulePlacement(
                    order_index=p.order_index,
                    lesson_id=inst_lesson_id,
                    start_col=p.start_col,
                    span=p.span,
                    description=p.description,
                    remarks=p.remarks,
                )
            )
        schedule.days.append(day)
    return True


def ensure_schedule_for_instance(
    db: Session, course: CourseInstance, user_id: int
) -> CourseSelectionSchedule:
    """Return the instance's schedule hub, creating it on first open.

    On creation it seeds from the master's schedule (copying day rows +
    placements remapped to the instance's lessons); if the master has no
    schedule it seeds empty day rows from the derived training-day count.
    Idempotent — later calls return the existing hub untouched.
    """
    schedule = _get_hub(db, course)
    if schedule is not None:
        return schedule

    schedule = CourseSelectionSchedule(course_instance_id=course.id)
    db.add(schedule)
    try:
        db.flush()  # assign hub id for the child day rows
    except IntegrityError:
        # A concurrent request (e.g. the page firing ensure twice) created the
        # hub first; the unique constraint on course_instance_id then rejects
        # this insert. Reuse the row the other request committed instead of
        # surfacing a 500. The unique index is what makes this safe.
        db.rollback()
        existing = _get_hub(db, course)
        if existing is not None:
            return existing
        raise

    if not (not course.schedule_seeded and _seed_from_master(db, course, schedule)):
        config = _derive_config(course)
        for i in range(max(1, config.total_training_days)):
            schedule.days.append(CourseSelectionScheduleDay(order_index=i))

    course.schedule_seeded = True
    course.updated_by_id = user_id
    db.commit()
    return schedule


# ─── Serialize ──────────────────────────────────────────────────────────────

def serialize_schedule_detail(
    db: Session, course: CourseInstance
) -> ScheduleDetailResponse:
    config = _derive_config(course)
    schedule = _get_hub(db, course)
    days = list(schedule.days) if schedule is not None else []
    return ScheduleDetailResponse(
        id=course.id,
        course_instance_id=course.id,
        course_title=course.title,
        course_date=course.start_date.isoformat() if course.start_date else None,
        status=schedule_status_of(course),
        config=config,
        calendar=_calendar_of(schedule),
        lessons=_lesson_catalogue(course, config.periods_per_day),
        days=[
            ScheduleDayItem(
                id=day.id,
                day_label=None,
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
            for day in days
        ],
    )


# ─── Upsert (full replace of days + placements) ─────────────────────────────

def _apply_lesson_units(
    course: CourseInstance, payload: ScheduleUpsert, valid_lessons: set[int]
) -> None:
    """Write block-unit-size edits back to the INSTANCE Lesson Creation."""
    if not payload.lesson_units:
        return
    lesson_creation = _instance_lesson_creation(course)
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
    course: CourseInstance, totals_by_lesson: dict[int, int]
) -> None:
    """Recompute each placed instance lesson's TOTAL (flight timing) from blocks."""
    lesson_creation = _instance_lesson_creation(course)
    if lesson_creation is None:
        return
    for lesson in lesson_creation.lessons:
        total = totals_by_lesson.get(lesson.id)
        if total:
            lesson.flight_timing = max(1, total)


def _apply_calendar(
    schedule: CourseSelectionSchedule, payload: ScheduleUpsert
) -> None:
    cal = payload.calendar
    if cal is None:
        return
    parsed: date | None = None
    if cal.start_date:
        try:
            parsed = date.fromisoformat(cal.start_date)
        except ValueError:
            parsed = None
    schedule.start_date = parsed
    schedule.off_weekdays = ",".join(str(int(w)) for w in cal.off_weekdays) or None
    schedule.holidays = ",".join(h for h in cal.holidays if h) or None


def upsert_schedule(
    db: Session,
    course: CourseInstance,
    payload: ScheduleUpsert,
    user_id: int,
) -> CourseInstance:
    if payload.status not in _VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"status must be one of {_VALID_STATUSES}",
        )

    config = _derive_config(course)
    valid_lessons = _valid_lesson_ids(course)

    schedule = _get_hub(db, course)
    if schedule is None:
        schedule = CourseSelectionSchedule(course_instance_id=course.id)
        db.add(schedule)
        db.flush()

    # Full replace: wipe the existing day rows (cascade clears placements).
    for day in list(schedule.days):
        db.delete(day)
    db.flush()

    # Sum of every persisted block's span per lesson → the lesson's TOTAL.
    totals_by_lesson: dict[int, int] = {}

    for d_idx, day_in in enumerate(payload.days):
        day = CourseSelectionScheduleDay(
            course_selection_schedule_id=schedule.id,
            order_index=d_idx,
        )
        ncols = _ncols_for_day(config, d_idx)
        occupied = [False] * ncols
        p_idx = 0
        for item in day_in.items:
            if item.lesson_id not in valid_lessons:
                continue
            start = max(0, min(item.start_col, ncols - 1))
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
                CourseSelectionSchedulePlacement(
                    order_index=p_idx,
                    lesson_id=item.lesson_id,
                    start_col=start,
                    span=span,
                    description=desc,
                    remarks=remarks,
                )
            )
            p_idx += 1
        schedule.days.append(day)

    _apply_lesson_units(course, payload, valid_lessons)
    _recalc_lesson_totals(course, totals_by_lesson)
    _apply_calendar(schedule, payload)

    course.schedule_completion = 100 if payload.status == "complete" else 0
    course.updated_by_id = user_id

    db.commit()
    return course


# ─── Lesson Track: enrolled students + per-student lesson completion ──────────

def list_lesson_track_students(
    db: Session, course: CourseInstance, lesson_id: int, user
) -> list[dict]:
    """Return the enrolled students for this course with their completion status
    for the given lesson, for the purpose of the lesson detail page.

    Admins see all students. Instructors see all students with a ``completed``
    flag that reflects the stored completion state for each student. Learners
    see only their own row with ``completed_by_me``.
    """
    from app.modules.course.models import CourseEnrollment
    from app.modules.profile.models import Profile
    from sqlalchemy import select

    pid = getattr(getattr(user, "profile", None), "id", None)
    from app.core.deps import has_permission
    from app.core.permissions import PermissionCode

    is_admin = has_permission(user, db, PermissionCode.ADMIN_FULL)

    rows = db.execute(
        select(Profile.id, Profile.first_name, Profile.middle_name, Profile.last_name, Profile.rank)
        .join(CourseEnrollment, CourseEnrollment.student_id == Profile.id)
        .where(CourseEnrollment.course_instance_id == course.id)
        .order_by(Profile.first_name, Profile.middle_name, Profile.last_name)
    ).all()

    # Fetch completion statuses + timestamps for all students of this lesson.
    from .lesson_content_models import CourseSelectionLessonCompletion
    if lesson_id is not None:
        completion_rows = {
            r.student_id: (r.completed_at, r.completed_by_id)
            for r in db.execute(
                select(CourseSelectionLessonCompletion.student_id, CourseSelectionLessonCompletion.completed_at, CourseSelectionLessonCompletion.completed_by_id).where(
                    CourseSelectionLessonCompletion.course_instance_id == course.id,
                    CourseSelectionLessonCompletion.lesson_id == lesson_id,
                    CourseSelectionLessonCompletion.content_type == "lesson",
                )
            ).all()
        }
    else:
        completion_rows = {}

    # Resolve teacher names for completed_by_id (single extra query).
    teacher_by_id: dict[int, str] = {}
    if lesson_id is not None and completion_rows:
        completed_by_ids = {values[1] for values in completion_rows.values() if values[1] is not None}
        if completed_by_ids:
            teacher_rows = db.execute(
                select(Profile.id, Profile.first_name, Profile.middle_name, Profile.last_name)
                .where(Profile.id.in_(completed_by_ids))
            ).all()
            for tr in teacher_rows:
                teacher_by_id[tr.id] = _build_full_name(tr.first_name, tr.middle_name, tr.last_name)

    return [
        {
            "student_id": r.id,
            "full_name": _build_full_name(r.first_name, r.middle_name, r.last_name),
            "rank": r.rank,
            "completed": r.id in completion_rows,
            "completed_at": completion_rows.get(r.id)[0].isoformat() if r.id in completion_rows else None,
            "completed_by": teacher_by_id.get(completion_rows.get(r.id, (None, None))[1]) if r.id in completion_rows else None,
            "completed_by_me": r.id == pid if pid else False,
        }
        for r in rows
    ]


def toggle_lesson_track(
    db: Session, course: CourseInstance, lesson_id: int, student_id: int, user
) -> None:
    """Toggle (insert or delete) a lesson completion record for a student.

    Requires instructor membership on the course. Idempotent — calling with
    completed=True when a row already exists deletes it, and vice versa.
    """
    require_course_instructor(db, course, user)
    from .lesson_content_models import CourseSelectionLessonCompletion

    existing = (
        db.query(CourseSelectionLessonCompletion)
        .where(
            CourseSelectionLessonCompletion.course_instance_id == course.id,
            CourseSelectionLessonCompletion.lesson_id == lesson_id,
            CourseSelectionLessonCompletion.content_type == "lesson",
            CourseSelectionLessonCompletion.student_id == student_id,
        )
        .first()
    )
    if existing is None:
        db.add(
                CourseSelectionLessonCompletion(
                    course_instance_id=course.id,
                    lesson_id=lesson_id,
                    content_type="lesson",
                    content_id=student_id,  # reuse content_id to store the student
                    student_id=student_id,
                    completed_by_id=user.id,
                )
        )
    else:
        db.delete(existing)
    db.commit()


def move_placement(
    db: Session,
    course: CourseInstance,
    placement_id: int,
    day_index: int,
    start_col: int,
    span: int,
    user_id: int,
) -> CourseInstance:
    """Relocate/resize ONE existing placement (Schedule Management teacher edit).

    Moves the block to the day row at ``day_index`` and positions it at
    ``start_col`` for ``span`` columns, clamped to that day's usable columns.
    Does not create or delete placements. Overlap with other blocks is allowed
    (the teacher is positioning explicitly, same as the grid editor)."""
    schedule = _get_hub(db, course)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found")

    placement = next(
        (p for d in schedule.days for p in d.placements if p.id == placement_id),
        None,
    )
    if placement is None:
        raise HTTPException(status_code=404, detail="Placement not found")

    target_day = next((d for d in schedule.days if d.order_index == day_index), None)
    if target_day is None:
        raise HTTPException(status_code=400, detail="Invalid day index")

    config = _derive_config(course)
    ncols = _ncols_for_day(config, day_index)
    start = max(0, min(start_col, ncols - 1))
    sp = max(1, min(span, ncols - start))

    # Assign via the relationship so the FK + both day collections stay in sync.
    placement.day = target_day
    placement.start_col = start
    placement.span = sp
    course.updated_by_id = user_id

    db.commit()
    return course


# ─── Helper: resolve LibraryMaterial id for a CSM file ────────────────────────


def _get_library_material_id(db: Session, cs_file: "CourseSelectionMaterialFile") -> int | None:
    """Return the id of the LibraryMaterial row linked to *cs_file*, or None."""
    from app.modules.library.models import LibraryMaterial

    lib_mat = db.query(LibraryMaterial).filter(
        LibraryMaterial.file_url == cs_file.storage_key,
        LibraryMaterial.material_type == "course",
    ).first()
    return lib_mat.id if lib_mat else None


# ─── Lesson Detail (read-only full page for Schedule Management) ─────────────

def serialize_lesson_full_detail(
    db: Session, course: CourseInstance, lesson_id: int, user=None
):
    """Aggregate everything the lesson detail page shows: the lesson's own info
    (labels resolved) plus the quizzes, forms, surveys and materials attached to
    it. One membership-gated payload so students (who lack the editor's write
    permissions) can still read it. Imports are local to avoid load-order cycles
    between the course-selection feature modules."""
    from fastapi import HTTPException

    from app.modules.course_info.services import (
        list_lesson_resource_options_for,
        list_resource_options,
    )
    from app.modules.course_selection_info.services import get_lesson_creation_tab
    from app.modules.course_selection_evaluation.services import (
        list_lesson_forms,
        list_lesson_quizzes,
    )
    from app.modules.course_selection_form.services import (
        list_form_links,
        list_survey_links,
    )
    from app.modules.course_selection_material.models import (
        CourseSelectionMaterialFile,
    )
    from .schemas import (
        LessonContentForm,
        LessonContentMaterial,
        LessonContentQuiz,
        LessonContentSurvey,
        LessonConductDetail,
        LessonFlightPackContent,
        LessonGeneralDetail,
        LessonResourceDetail,
        LessonUnitDetail,
        ScheduleLessonDetailResponse,
    )

    # The lesson's own ORM row (carries the environment/period-type relations
    # whose labels aren't in the structured LessonItem).
    lesson_creation = _instance_lesson_creation(course)
    orm_lesson = None
    if lesson_creation is not None:
        orm_lesson = next(
            (l for l in lesson_creation.lessons if l.id == lesson_id), None
        )
    if orm_lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    # Structured units/resources/conducts (IDs) via the existing serializer.
    _, data = get_lesson_creation_tab(course)
    item = next(
        (l for l in (data.lessons if data else []) if l.id == lesson_id), None
    )

    # Label maps: objectives from the global master picklists; resources from the
    # master's Resources tab (same source the editor's combos use).
    to_map = {o.id: o.label for o in list_resource_options(db, "training_objective")}
    eo_map = {o.id: o.label for o in list_resource_options(db, "enabling_objective")}
    tp_map = {o.id: o.label for o in list_resource_options(db, "teaching_point")}
    # Resource ids are only unique WITHIN a category (each category is backed by
    # its own master table), so resolve labels per-category — a flat {id: label}
    # map would let categories with the same id collide.
    res_by_cat: dict[str, dict[int, str]] = {}
    cat_label: dict[str, str] = {}
    master = course.master
    if master is not None:
        for cat in list_lesson_resource_options_for(getattr(master, "resources", None)):
            cat_label[cat.category] = cat.categoryLabel
            res_by_cat[cat.category] = {opt.id: opt.label for opt in cat.resources}

    units = [
        LessonUnitDetail(
            training_objective=to_map.get(u.trainingObjectiveId) if u.trainingObjectiveId else None,
            enabling_objective=eo_map.get(u.enablingObjectiveId) if u.enablingObjectiveId else None,
            teaching_point=tp_map.get(u.teachingPointId) if u.teachingPointId else None,
        )
        for u in (item.units if item else [])
    ]
    resources = [
        LessonResourceDetail(
            label=(
                res_by_cat.get(r.category or "", {}).get(r.resourceId)
                if r.resourceId
                else None
            ),
            category=r.category,
            category_label=cat_label.get(r.category) if r.category else None,
        )
        for r in (item.resources if item else [])
    ]
    conducts = [
        LessonConductDetail(part=c.part, point=c.point, material=c.material, notes=c.notes)
        for c in (item.conducts if item else [])
    ]

    total = max(1, _pos(orm_lesson.flight_timing, 1))
    unit = _pos(orm_lesson.period_per_unit, 0) or total
    general = LessonGeneralDetail(
        id=orm_lesson.id,
        lesson_number=orm_lesson.lesson_number,
        lesson_title=orm_lesson.lesson_title,
        environment_label=orm_lesson.environment.label if orm_lesson.environment else None,
        period_type_label=orm_lesson.period_type.label if orm_lesson.period_type else None,
        total_periods=total,
        period_per_unit=max(1, unit),
        instructor_student_ratio=orm_lesson.instructor_student_ratio,
        location=orm_lesson.location,
        health_and_safety=orm_lesson.health_and_safety,
        units=units,
        resources=resources,
        conducts=conducts,
    )

    # Per-lesson release/completion state, keyed by (content_type, content_id)
    # where content_id is the quiz/form/survey id (not the association row id).
    # Releases are now per-student: a teacher sees which students an item is sent
    # to (and who's already taken it); a student sees only their own state.
    released_map, completed_map = _lesson_release_maps(db, course, lesson_id)
    can_manage = is_course_instructor(db, course, user) if user is not None else False
    viewer_pid = getattr(getattr(user, "profile", None), "id", None)

    def _release_flags(content_type: str, cid: int) -> dict:
        released_ids = released_map.get((content_type, cid), set())
        completed_ids = completed_map.get((content_type, cid), set())
        if can_manage:
            # Teacher/admin: "released" = sent to anyone; expose the roster's state.
            return {
                "released": len(released_ids) > 0,
                "completed_by_me": False,
                "released_student_ids": sorted(released_ids),
                "completed_student_ids": sorted(completed_ids),
            }
        # Student: "released" = sent to me; never leak other students' state.
        return {
            "released": viewer_pid is not None and viewer_pid in released_ids,
            "completed_by_me": viewer_pid is not None and viewer_pid in completed_ids,
            "released_student_ids": [],
            "completed_student_ids": [],
        }

    quizzes = [
        LessonContentQuiz(
            id=q.id, quiz_id=q.quiz_id, name=q.name, description=q.description,
            type=q.type, question_count=q.question_count,
            assessment_type=q.assessment_type, max_mark=q.max_mark,
            pass_mark=q.pass_mark, pass_percentage=q.pass_percentage,
            **_release_flags("quiz", q.quiz_id),
        )
        for q in list_lesson_quizzes(db, course, lesson_id)
    ]
    evaluation_forms = [
        LessonContentForm(
            id=f.id, form_id=f.form_id, title=f.title, description=f.description,
            status=f.status, question_count=f.question_count,
            **_release_flags("form", f.form_id),
        )
        for f in list_lesson_forms(db, course, lesson_id)
    ]
    surveys = [
        LessonContentSurvey(
            id=s.id, survey_id=s.survey_id, title=s.title, description=s.description,
            status=s.status, question_count=s.question_count,
            **_release_flags("survey", s.survey_id),
        )
        for s in list_survey_links(db, course, lesson_id)
    ]
    forms = [
        LessonContentForm(
            id=f.id, form_id=f.form_id, title=f.title, description=f.description,
            status=f.status, question_count=f.question_count,
            **_release_flags("form", f.form_id),
        )
        for f in list_form_links(db, course, lesson_id)
    ]
    # A form can be attached to a lesson via both the Evaluation and Form Builder
    # categories. Attach-time guards block new cross-category duplicates, but any
    # pre-existing ones must not surface twice in the merged lesson view — drop
    # from the Form Builder list any form already shown under Evaluation.
    _eval_form_ids = {f.form_id for f in evaluation_forms}
    forms = [f for f in forms if f.form_id not in _eval_form_ids]

    files = (
        db.execute(
            select(CourseSelectionMaterialFile)
            .where(
                CourseSelectionMaterialFile.course_instance_id == course.id,
                CourseSelectionMaterialFile.lesson_id == lesson_id,
            )
            .order_by(CourseSelectionMaterialFile.created_at.desc())
        )
        .scalars()
        .unique()
        .all()
    )
    materials = [
        LessonContentMaterial(
            id=str(f.id),
            filename=f.filename,
            content_type=f.content_type,
            file_size=f.file_size,
            download_url=f"/api/v1/course-selection-schedules/{course.id}/lessons/{lesson_id}/materials/{f.id}/download",
            library_material_id=_get_library_material_id(db, f),
        )
        for f in files
    ]

    # Flight-pack associations that include this lesson.
    from app.modules.course_selection_currencies_certificate.models import (
        CourseSelectionInfoFlightPackAssociation,
        CourseSelectionInfoFlightPackAssociationLesson,
    )
    flight_packs = (
        db.query(
            CourseSelectionInfoFlightPackAssociation,
            CourseSelectionInfoFlightPackAssociationLesson,
        )
        .join(CourseSelectionInfoFlightPackAssociationLesson)
        .join(CourseSelectionInfoFlightPackage)
        .where(
            CourseSelectionInfoFlightPackage.course_instance_id == course.id,
            CourseSelectionInfoFlightPackAssociationLesson.lesson_id == lesson_id,
        )
        .all()
    )
    flight_packs = [
        LessonFlightPackContent(
            id=assoc.id,
            package_id=assoc.package_id,
            package_name=assoc.package.name if assoc.package else "",
            task_count=len(assoc.package.tasks) if assoc.package else 0,
        )
        for assoc, assoc_lesson in flight_packs
    ]

    return ScheduleLessonDetailResponse(
        course_instance_id=course.id,
        course_title=course.title,
        can_manage=can_manage,
        lesson=general,
        quizzes=quizzes,
        evaluation_forms=evaluation_forms,
        surveys=surveys,
        forms=forms,
        flight_packs=flight_packs,
        materials=materials,
        enrolled_students=list_lesson_track_students(db, course, lesson_id, user),
    )


# ── Lesson-material reading progress (Schedule Management in-app reader) ──────
# Per-user, per-file progress for a course's own lesson materials. Mirrors the
# Library reading-progress pattern but keyed by the UUID file id, so the Progress
# Tracker can compute real material completion per course instance.

def get_or_create_material_progress(db: Session, user_id: int, file_id):
    """Return the caller's progress row for a lesson material file, creating an
    empty one (0/0) if none exists yet."""
    from app.modules.course_selection_material.models import (
        CourseSelectionMaterialUserProgress,
    )

    row = db.execute(
        select(CourseSelectionMaterialUserProgress).where(
            CourseSelectionMaterialUserProgress.user_id == user_id,
            CourseSelectionMaterialUserProgress.file_id == file_id,
        )
    ).scalar_one_or_none()
    if row is None:
        row = CourseSelectionMaterialUserProgress(user_id=user_id, file_id=file_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def upsert_material_progress(db: Session, user_id: int, file_id, pages_read, total_pages):
    """Upsert the caller's reading progress for a lesson material file. pages_read
    only ever advances (never regresses); total_pages is set once the reader knows
    it. Always writes for the authenticated user_id (callers must not pass another
    user's id)."""
    from app.modules.course_selection_material.models import (
        CourseSelectionMaterialUserProgress,
    )

    row = db.execute(
        select(CourseSelectionMaterialUserProgress).where(
            CourseSelectionMaterialUserProgress.user_id == user_id,
            CourseSelectionMaterialUserProgress.file_id == file_id,
        )
    ).scalar_one_or_none()
    if row is None:
        row = CourseSelectionMaterialUserProgress(user_id=user_id, file_id=file_id)
        db.add(row)
    if pages_read is not None:
        row.pages_read = max(row.pages_read or 0, int(pages_read))
    if total_pages:
        row.total_pages = int(total_pages)
    db.commit()
    db.refresh(row)
    return row
