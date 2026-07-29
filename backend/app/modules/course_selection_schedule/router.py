from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse as FastAPIFileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.modules.course_selection_material.models import CourseSelectionMaterialFile
from app.modules.course_selection_material.services import storage as material_storage

from .schemas import (
    LessonContentRef,
    LessonReleaseTargets,
    LessonTrackUpsert,
    MaterialProgressRead,
    MaterialProgressUpsert,
    PlacementMoveUpsert,
    ScheduleDetailResponse,
    ScheduleLessonDetailResponse,
    ScheduleUpsert,
)
from .services import (
    ensure_schedule_for_instance,
    get_or_create_material_progress,
    get_or_raise_course,
    mark_completion,
    move_placement,
    toggle_lesson_track as toggle_lesson_track_service,
    set_release_targets,
    require_course_membership,
    serialize_lesson_full_detail,
    serialize_schedule_detail,
    unrelease_content,
    upsert_material_progress,
    upsert_schedule,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/course-selection-schedules", tags=["Course Selection Schedule"]
)


@router.post(
    "/{course_instance_id}/ensure",
    response_model=SuccessResponse[ScheduleDetailResponse],
)
def ensure_course_instance_schedule(
    course_instance_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    """Return this instance's schedule, creating it (seeded from the master) on
    first open. Idempotent. The grid config is derived live from the instance's
    Course Information; only placements + calendar settings are persisted."""
    course = get_or_raise_course(db, course_instance_id)
    ensure_schedule_for_instance(db, course, user.id)
    return ok(serialize_schedule_detail(db, course))


@router.get(
    "/{course_instance_id}",
    response_model=SuccessResponse[ScheduleDetailResponse],
)
def read_course_instance_schedule(
    course_instance_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """Read-only view of an instance's schedule for its members (students &
    teachers), used by Schedule Management. Lazily seeds from the master on first
    read (same as the editor's ensure). When the editor hasn't run "Generate
    dates" yet, the calendar's start date falls back to the instance's own
    ``start_date`` (Sat/Sun off) so blocks still land on real dates."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    ensure_schedule_for_instance(db, course, user.id)
    detail = serialize_schedule_detail(db, course)
    if not detail.calendar.start_date and course.start_date:
        detail.calendar.start_date = course.start_date.isoformat()
        if not detail.calendar.off_weekdays:
            detail.calendar.off_weekdays = [5, 6]
    return ok(detail)


@router.get(
    "/{course_instance_id}/lessons/{lesson_id}/detail",
    response_model=SuccessResponse[ScheduleLessonDetailResponse],
)
def read_lesson_detail(
    course_instance_id: int,
    lesson_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """Full read-only lesson detail for Schedule Management: the lesson's own
    info plus the quizzes, forms, surveys and materials attached to it. Gated by
    course membership so students and instructors of the course can both read it
    (the editor's per-category endpoints are write-gated)."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    return ok(serialize_lesson_full_detail(db, course, lesson_id, user))


def _get_lesson_file_or_404(db: Session, course, lesson_id: int, file_id: UUID):
    """The material file, verified to belong to this course instance + lesson."""
    file_record = db.get(CourseSelectionMaterialFile, file_id)
    if (
        file_record is None
        or file_record.course_instance_id != course.id
        or file_record.lesson_id != lesson_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    return file_record


def _material_progress_read(row) -> MaterialProgressRead:
    return MaterialProgressRead(
        file_id=str(row.file_id),
        pages_read=row.pages_read,
        total_pages=row.total_pages,
        completed=row.total_pages > 0 and row.pages_read >= row.total_pages,
    )


@router.get("/{course_instance_id}/lessons/{lesson_id}/materials/{file_id}/download")
def download_lesson_material(
    course_instance_id: int,
    lesson_id: int,
    file_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """Download a material file attached to a lesson, for the same audience that
    reads the lesson detail (course members with schedule_entry:read). The lesson
    detail's Download button points here, so a viewer who lacks the generic
    material:read permission can still download a lesson's own materials. The file
    is verified to belong to this course instance + lesson before it is served."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    file_record = _get_lesson_file_or_404(db, course, lesson_id, file_id)
    abs_path = material_storage.get_absolute_path(file_record.storage_key)
    if not abs_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")
    return FastAPIFileResponse(
        path=str(abs_path),
        filename=file_record.filename,
        media_type=file_record.content_type,
    )


@router.get(
    "/{course_instance_id}/lessons/{lesson_id}/materials/{file_id}/progress",
    response_model=SuccessResponse[MaterialProgressRead],
)
def read_lesson_material_progress(
    course_instance_id: int,
    lesson_id: int,
    file_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """The caller's reading progress for one lesson material file."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    file_record = _get_lesson_file_or_404(db, course, lesson_id, file_id)
    row = get_or_create_material_progress(db, user.id, file_record.id)
    return ok(_material_progress_read(row))


@router.put(
    "/{course_instance_id}/lessons/{lesson_id}/materials/{file_id}/progress",
    response_model=SuccessResponse[MaterialProgressRead],
)
def update_lesson_material_progress(
    course_instance_id: int,
    lesson_id: int,
    file_id: UUID,
    payload: MaterialProgressUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """Record the caller's reading progress for one lesson material file (gated
    like the lesson detail itself). Always writes for the authenticated user, and
    pages_read only advances — so a student can only move their own bar forward."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    file_record = _get_lesson_file_or_404(db, course, lesson_id, file_id)
    row = upsert_material_progress(
        db, user.id, file_record.id, payload.pages_read, payload.total_pages
    )
    return ok(_material_progress_read(row))


@router.post(
    "/{course_instance_id}/lessons/{lesson_id}/releases",
    response_model=SuccessResponse[ScheduleLessonDetailResponse],
)
def release_lesson_content(
    course_instance_id: int,
    lesson_id: int,
    payload: LessonReleaseTargets,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """Teacher sets which students a quiz/form/survey is released to for this
    lesson (send to some or all, or revoke by omitting). Gated to instructors of
    the course (checked in the service); students who've already taken it are
    always kept. Returns the refreshed lesson detail so the caller sees the new
    per-student released state."""
    course = get_or_raise_course(db, course_instance_id)
    set_release_targets(
        db, course, lesson_id, payload.content_type, payload.content_id, payload.student_ids, user
    )
    return ok(serialize_lesson_full_detail(db, course, lesson_id, user))


@router.delete(
    "/{course_instance_id}/lessons/{lesson_id}/releases",
    response_model=SuccessResponse[ScheduleLessonDetailResponse],
)
def unrelease_lesson_content(
    course_instance_id: int,
    lesson_id: int,
    payload: LessonContentRef,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """Teacher revokes a release (instructor-only). Completions are preserved."""
    course = get_or_raise_course(db, course_instance_id)
    unrelease_content(db, course, lesson_id, payload.content_type, payload.content_id, user)
    return ok(serialize_lesson_full_detail(db, course, lesson_id, user))


@router.post(
    "/{course_instance_id}/lessons/{lesson_id}/completions",
    response_model=SuccessResponse[ScheduleLessonDetailResponse],
)
def complete_lesson_content(
    course_instance_id: int,
    lesson_id: int,
    payload: LessonContentRef,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """Student marks a released item as taken for this lesson (member-gated;
    requires the item to be released). Returns refreshed lesson detail."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    mark_completion(db, course, lesson_id, payload.content_type, payload.content_id, user)
    return ok(serialize_lesson_full_detail(db, course, lesson_id, user))


@router.put(
    "/{course_instance_id}/lessons/{lesson_id}/tracks/{student_id}",
    response_model=SuccessResponse[ScheduleLessonDetailResponse],
)
def toggle_lesson_track(
    course_instance_id: int,
    lesson_id: int,
    student_id: int,
    payload: LessonTrackUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """Toggle a student's lesson completion (instructor-only).

    ``payload.completed`` controls whether to insert a completion row (``True``)
    or delete an existing one (``False``) — idempotent.  Returns the refreshed
    lesson detail including the updated ``enrolled_students`` list.
    """
    course = get_or_raise_course(db, course_instance_id)
    toggle_lesson_track_service(db, course, lesson_id, student_id, user)
    return ok(serialize_lesson_full_detail(db, course, lesson_id, user))


@router.patch(
    "/{course_instance_id}/placements/{placement_id}",
    response_model=SuccessResponse[ScheduleDetailResponse],
)
def move_course_instance_placement(
    course_instance_id: int,
    placement_id: int,
    payload: PlacementMoveUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_WRITE)),
):
    """Move/resize a single placement from Schedule Management. Gated by
    schedule_entry:write + course membership, so an instructor of the course can
    reposition lessons without the editor's course_info:write (and without the
    destructive full-replace upsert). Students lack the write permission."""
    course = get_or_raise_course(db, course_instance_id)
    require_course_membership(db, course, user)
    move_placement(db, course, placement_id, payload.day_index, payload.start_col, payload.span, user.id)
    return ok(serialize_schedule_detail(db, course))


@router.put(
    "/{course_instance_id}",
    response_model=SuccessResponse[ScheduleDetailResponse],
)
def save_course_instance_schedule(
    course_instance_id: int,
    payload: ScheduleUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    course = get_or_raise_course(db, course_instance_id)
    upsert_schedule(db, course, payload, user.id)
    return ok(serialize_schedule_detail(db, course))
