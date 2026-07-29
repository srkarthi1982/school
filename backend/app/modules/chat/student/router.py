from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.modules.chat.student.schemas import StudentContactDirectoryResponse
from app.modules.chat.student.services import search_student_contacts
from app.modules.chat.host_integration import get_db, get_current_user, require_roles

router = APIRouter(prefix="/student/chat", tags=["chat-student"])


@router.get("/students", response_model=StudentContactDirectoryResponse)
async def student_directory(
    q: str = Query(default="", max_length=255),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("student","admin", "teacher")),
) -> StudentContactDirectoryResponse:
    items = search_student_contacts(db, current_user, q, limit)
    return StudentContactDirectoryResponse(items=items)
