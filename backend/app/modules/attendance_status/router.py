import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.core.schemas import apply_sort, paginate

from .models import AttendanceStatus
from .schemas import (
    AttendanceStatusCreate,
    AttendanceStatusResponse,
    AttendanceStatusUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/attendance_status", tags=["Attendance Status"])


@router.get("/", response_model=SuccessResponse[list[AttendanceStatusResponse]])
def list_attendance_statuses(
    code: str | None = Query(None, description="Partial match on code"),
    name: str | None = Query(None, description="Partial match on name"),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=2000),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(AttendanceStatus)
    if code:
        query = query.filter(AttendanceStatus.code.ilike(f"%{code}%"))
    if name:
        query = query.filter(AttendanceStatus.name.ilike(f"%{name}%"))
    query = apply_sort(query, AttendanceStatus, sort_by, sort_order)
    return paginate(query, page, page_size)


@router.get("/{status_id}", response_model=SuccessResponse[AttendanceStatusResponse])
def get_attendance_status(
    status_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    status = db.get(AttendanceStatus, status_id)
    if not status:
        raise HTTPException(status_code=404, detail="Attendance status not found")
    return ok(status)


@router.post(
    "/",
    response_model=SuccessResponse[AttendanceStatusResponse],
    status_code=201,
    dependencies=[Depends(require_permission(PermissionCode.ATTENDANCE_WRITE))],
)
def create_attendance_status(
    data: AttendanceStatusCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # Set creator based on authenticated user
    status = AttendanceStatus(
        created_by_id=getattr(current_user, "id", None),
        **data.model_dump()
    )
    db.add(status)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Attendance status code already exists")
    db.refresh(status)
    return ok(status)


@router.put(
    "/{status_id}",
    response_model=SuccessResponse[AttendanceStatusResponse],
    dependencies=[Depends(require_permission(PermissionCode.ATTENDANCE_WRITE))],
)
def update_attendance_status(
    status_id: int,
    data: AttendanceStatusUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    status = db.get(AttendanceStatus, status_id)
    if not status:
        raise HTTPException(status_code=404, detail="Attendance status not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(status, key, value)
    # Set the updater based on authenticated user
    setattr(status, "updated_by_id", getattr(current_user, "id", None))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Attendance status code already exists")
    db.refresh(status)
    return ok(status)


@router.delete(
    "/{status_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PermissionCode.ATTENDANCE_WRITE))],
)
def delete_attendance_status(
    status_id: int,
    db: Session = Depends(get_db),
):
    status = db.get(AttendanceStatus, status_id)
    if not status:
        raise HTTPException(status_code=404, detail="Attendance status not found")
    db.delete(status)
    db.commit()