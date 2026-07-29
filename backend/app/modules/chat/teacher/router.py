from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.modules.chat.teacher.schemas import TeacherStudentDirectoryResponse
from app.modules.chat.teacher.services import search_students_for_teacher
from app.modules.chat.host_integration import get_db, get_current_user, require_roles

router = APIRouter(prefix="/teacher/chat", tags=["chat-teacher"])


@router.get("/students", response_model=TeacherStudentDirectoryResponse)
async def teacher_student_directory(
    q: str = Query(default="", max_length=255),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("teacher", "admin")),
) -> TeacherStudentDirectoryResponse:
    items = search_students_for_teacher(db, current_user.id, q, limit)
    return TeacherStudentDirectoryResponse(items=items)
