from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.modules.chat.admin.schemas import AdminUserDirectoryResponse
from app.modules.chat.admin.services import admin_search_users
from app.modules.chat.host_integration import get_db, get_current_user, require_roles

router = APIRouter(prefix="/admin/chat", tags=["chat-admin"])


@router.get("/users", response_model=AdminUserDirectoryResponse)
async def admin_user_directory(
    q: str = Query(default="", max_length=255),
    role: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin")),
) -> AdminUserDirectoryResponse:
    items = admin_search_users(db, q, limit, role=role, current_user_id=current_user.id)
    return AdminUserDirectoryResponse(items=items)
