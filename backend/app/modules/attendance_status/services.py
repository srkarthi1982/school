from sqlalchemy.orm import Session

from app.core.permissions import PermissionCode
from app.core.deps import require_permission

from .models import AttendanceStatus
from .schemas import AttendanceStatusCreate, AttendanceStatusUpdate


@require_permission(PermissionCode.ATTENDANCE_WRITE)
def list_statuses(
    db: Session,
    code: str | None = None,
    name: str | None = None,
    sort_by: str | None = None,
    sort_order: str = "asc",
):
    """Return a query for attendance statuses with optional filters."""
    query = db.query(AttendanceStatus)
    if code:
        query = query.filter(AttendanceStatus.code.ilike(f"%{code}%"))
    if name:
        query = query.filter(AttendanceStatus.name.ilike(f"%{name}%"))
    if sort_by:
        column = getattr(AttendanceStatus, sort_by, None)
        if column is not None:
            query = query.order_by(
                column.asc() if sort_order == "asc" else column.desc()
            )
    return query


@require_permission(PermissionCode.ATTENDANCE_WRITE)
def create_status(db: Session, data: AttendanceStatusCreate) -> AttendanceStatus:
    """Create a new attendance status."""
    status = AttendanceStatus(**data.model_dump())
    db.add(status)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(status)
    return status


@require_permission(PermissionCode.ATTENDANCE_WRITE)
def update_status(
    db: Session, status_id: int, data: AttendanceStatusUpdate
) -> AttendanceStatus:
    """Update an existing attendance status."""
    status = db.get(AttendanceStatus, status_id)
    if not status:
        raise ValueError("Attendance status not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(status, key, value)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(status)
    return status


@require_permission(PermissionCode.ATTENDANCE_WRITE)
def delete_status(db: Session, status_id: int) -> None:
    """Delete an attendance status."""
    status = db.get(AttendanceStatus, status_id)
    if not status:
        raise ValueError("Attendance status not found")
    db.delete(status)
    db.commit()