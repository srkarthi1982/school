from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok

# Membership + course lookup are shared with the selection schedule.
from app.modules.course.guards import ensure_course_not_stopped
from app.modules.course_selection_schedule.services import (
    get_or_raise_course,
    require_course_membership,
)

from .schemas import (
    DayDateUpdate,
    SessionPlacementAdd,
    SessionPlacementMove,
    SessionScheduleDetailResponse,
    SessionScheduleMeta,
    SessionScheduleUpsert,
)
from .services import (
    add_placement,
    remove_placement,
    copy_selection_to_session,
    ensure_session_for_instance,
    get_meta,
    move_placement,
    serialize_schedule_detail,
    set_day_date,
    upsert_schedule,
)

router = APIRouter(
    prefix="/course-session-schedules", tags=["Course Session Schedule"]
)


@router.get(
    "/{course_instance_id}",
    response_model=SuccessResponse[SessionScheduleDetailResponse],
)
def read_course_session_schedule(
    course_instance_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """Operational schedule for this instance's members (students & teachers).

    Lazily heals (copies from the selection template) for courses approved
    before this feature. Returns ``available=false`` when the course isn't
    approved yet (no session schedule), so the viewer shows an empty-state."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    ensure_session_for_instance(db, course, user.id)
    return ok(serialize_schedule_detail(db, course))


@router.get(
    "/{course_instance_id}/meta",
    response_model=SuccessResponse[SessionScheduleMeta],
)
def read_course_session_meta(
    course_instance_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """Lightweight session state for the approve flow's keep/reset prompt:
    whether a session schedule exists and whether a user has modified it."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    return ok(get_meta(db, course))


@router.put(
    "/{course_instance_id}",
    response_model=SuccessResponse[SessionScheduleDetailResponse],
)
def save_course_session_schedule(
    course_instance_id: int,
    payload: SessionScheduleUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_WRITE)),
):
    """Full upsert of the session schedule (operational add/remove + dates).
    Gated by schedule_entry:write + membership so course instructors can edit
    without the editor's course_info:write."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    ensure_course_not_stopped(db, course.id)
    upsert_schedule(db, course, payload, user.id)
    return ok(serialize_schedule_detail(db, course))


@router.patch(
    "/{course_instance_id}/placements/{placement_id}",
    response_model=SuccessResponse[SessionScheduleDetailResponse],
)
def move_course_session_placement(
    course_instance_id: int,
    placement_id: int,
    payload: SessionPlacementMove,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_WRITE)),
):
    """Move/resize a single placement to a free-form time (drag/resize)."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    ensure_course_not_stopped(db, course.id)
    move_placement(
        db,
        course,
        placement_id,
        payload.day_index,
        payload.start_minute,
        payload.duration_minute,
        user.id,
    )
    return ok(serialize_schedule_detail(db, course))


@router.post(
    "/{course_instance_id}/placements",
    response_model=SuccessResponse[SessionScheduleDetailResponse],
)
def add_course_session_placement(
    course_instance_id: int,
    payload: SessionPlacementAdd,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_WRITE)),
):
    """Add a new lesson placement to the session schedule at a free-form time.
    Gated by schedule_entry:write + course membership. This is operational only —
    the added lesson is NOT synced back to the course instance/selection schedule."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    ensure_course_not_stopped(db, course.id)
    add_placement(
        db,
        course,
        payload.lesson_id,
        payload.day_index,
        payload.start_minute,
        payload.duration_minute,
        user.id,
    )
    return ok(serialize_schedule_detail(db, course))


@router.delete(
    "/{course_instance_id}/placements/{placement_id}",
    response_model=SuccessResponse[SessionScheduleDetailResponse],
)
def delete_course_session_placement(
    course_instance_id: int,
    placement_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_WRITE)),
):
    """Delete a single lesson placement from the session schedule (teacher remove).
    Gated by schedule_entry:write + course membership. Operational only — nothing
    is synced back to the course instance/selection schedule."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    ensure_course_not_stopped(db, course.id)
    remove_placement(db, course, placement_id, user.id)
    return ok(serialize_schedule_detail(db, course))


@router.patch(
    "/{course_instance_id}/days/{day_id}/date",
    response_model=SuccessResponse[SessionScheduleDetailResponse],
)
def set_course_session_day_date(
    course_instance_id: int,
    day_id: int,
    payload: DayDateUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_WRITE)),
):
    """Edit one day row's real date, decoupled from the calendar formula."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    ensure_course_not_stopped(db, course.id)
    set_day_date(db, course, day_id, payload.date, user.id)
    return ok(serialize_schedule_detail(db, course))


@router.post(
    "/{course_instance_id}/reset",
    response_model=SuccessResponse[SessionScheduleDetailResponse],
)
def reset_course_session_schedule(
    course_instance_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_WRITE)),
):
    """Reset the session schedule from the selection template (force re-copy),
    discarding operational edits. Backs the approve dialog's "Reset" choice."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    ensure_course_not_stopped(db, course.id)
    copy_selection_to_session(db, course, force=True)
    return ok(serialize_schedule_detail(db, course))
