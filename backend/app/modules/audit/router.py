from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse
from app.core.schemas import apply_sort, paginate

from .models import AuditLog
from .schemas import AuditLogResponse

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("/", response_model=SuccessResponse[list[AuditLogResponse]])
def list_audit_logs(
    table_name: str | None = None,
    row_id: str | None = None,
    operation: str | None = None,
    user_id: int | None = None,
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.AUDIT_READ)),
):
    from app.modules.users.models import User

    # Eager-load user + profile so user_name doesn't trigger a query per row.
    query = db.query(AuditLog).options(
        joinedload(AuditLog.user).joinedload(User.profile)
    )
    if table_name:
        query = query.filter(AuditLog.table_name == table_name)
    if row_id:
        query = query.filter(AuditLog.row_id == row_id)
    if operation:
        query = query.filter(AuditLog.operation == operation)
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if sort_by:
        query = apply_sort(query, AuditLog, sort_by, sort_order)
    else:
        # Newest first by default.
        query = query.order_by(AuditLog.id.desc())
    return paginate(query, page, page_size)
