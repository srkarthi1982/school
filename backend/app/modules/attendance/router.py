import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.core.schemas import apply_sort, paginate

from .models import Attendance
from .schemas import AttendanceCreate, AttendanceResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/attendance", tags=["Attendance"])


def _find_existing(db: Session, data: AttendanceCreate) -> Attendance | None:
    """Locate the attendance row that ``data`` would collide with.

    Session-scoped records (``session_placement_id`` set) are identified by
    (student, placement); legacy/daily rows by (student, lesson, date).
    """
    q = db.query(Attendance).filter(Attendance.student_id == data.student_id)
    if data.session_placement_id is not None:
        q = q.filter(Attendance.session_placement_id == data.session_placement_id)
    else:
        q = q.filter(
            Attendance.session_placement_id.is_(None),
            Attendance.date == data.date,
            Attendance.lesson_id == data.lesson_id
            if data.lesson_id is not None
            else Attendance.lesson_id.is_(None),
        )
    return q.first()


def _guard_course_not_stopped(
    db: Session, session_placement_id: int | None, lesson_id: int | None
) -> None:
    """Reject attendance writes for a stopped course. Resolution goes through
    the session placement when set, else the lesson; legacy daily rows with
    neither carry no course reference and pass through unguarded."""
    # Local import: attendance loads before the course package in
    # MODULE_NAMES, so a module-level import would be circular.
    from app.modules.course.guards import (
        ensure_lesson_not_stopped,
        ensure_placement_not_stopped,
    )

    if session_placement_id is not None:
        ensure_placement_not_stopped(db, session_placement_id)
    elif lesson_id is not None:
        ensure_lesson_not_stopped(db, lesson_id)


@router.get("/", response_model=SuccessResponse[list[AttendanceResponse]])
def list_attendance(
    student_id: int | None = None,
    lesson_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=2000),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Attendance)
    if student_id:
        query = query.filter(Attendance.student_id == student_id)
    if lesson_id:
        query = query.filter(Attendance.lesson_id == lesson_id)
    if date_from:
        query = query.filter(Attendance.date >= date_from)
    if date_to:
        query = query.filter(Attendance.date <= date_to)
    query = apply_sort(query, Attendance, sort_by, sort_order)
    return paginate(query, page, page_size)


@router.post("/", response_model=SuccessResponse[AttendanceResponse], status_code=201)
def create_attendance(
    data: AttendanceCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ATTENDANCE_WRITE)),
):
    _guard_course_not_stopped(db, data.session_placement_id, data.lesson_id)
    # Check for an existing attendance with the same unique fields. When the record
    # is scoped to a concrete session (placement), that is the identity; otherwise
    # fall back to the legacy (student, lesson, date) key.
    existing = _find_existing(db, data)
    if existing:
        return ok(existing)

    # No existing record, create a new one
    attendance = Attendance(**data.model_dump())
    db.add(attendance)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Attempt to fetch an existing attendance that matches the unique fields
        duplicate = _find_existing(db, data)
        if duplicate:
            return ok(duplicate)
        raise HTTPException(status_code=409, detail="Attendance record already exists for this student/session")
    db.refresh(attendance)
    return ok(attendance)


@router.post("/bulk", response_model=SuccessResponse[list[AttendanceResponse]], status_code=201)
def bulk_create_attendance(
    records: list[AttendanceCreate],
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ATTENDANCE_WRITE)),
):
    for r in records:
        _guard_course_not_stopped(db, r.session_placement_id, r.lesson_id)
    attendances = [Attendance(**r.model_dump()) for r in records]
    db.add_all(attendances)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="One or more attendance records already exist")
    for a in attendances:
        db.refresh(a)
    return ok(attendances)


@router.put("/{attendance_id}", response_model=SuccessResponse[AttendanceResponse])
def update_attendance(
    attendance_id: int,
    data: AttendanceCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ATTENDANCE_WRITE)),
):
    attendance = db.get(Attendance, attendance_id)
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    _guard_course_not_stopped(
        db, attendance.session_placement_id, attendance.lesson_id)
    for key, value in data.model_dump().items():
        setattr(attendance, key, value)
    db.commit()
    db.refresh(attendance)
    return ok(attendance)


@router.delete("/{attendance_id}", status_code=204)
def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ATTENDANCE_WRITE)),
):
    attendance = db.get(Attendance, attendance_id)
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    _guard_course_not_stopped(
        db, attendance.session_placement_id, attendance.lesson_id)
    db.delete(attendance)
    db.commit()
