from pydantic import BaseModel
from app.modules.chat.common.schemas import UserReference

class TeacherStudentDirectoryResponse(BaseModel):
    items: list[UserReference]