from pydantic import BaseModel
from app.modules.chat.common.schemas import UserReference

class StudentContactDirectoryResponse(BaseModel):
    items: list[UserReference]