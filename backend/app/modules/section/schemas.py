from pydantic import BaseModel

from app.core.schemas import AuditedResponse, TimestampedResponse
from ..profile.schemas import TeacherResponse

class SectionCreate(BaseModel):
    code: str
    course_id: int
    semester_id: int
    teacher_id: int
    max_students: int = 40
    room: str | None = None


class SectionUpdate(SectionCreate):
    version: int


class SectionResponse(AuditedResponse):
    id: int
    code: str
    course_id: int
    semester_id: int
    teacher_id: int
    max_students: int
    room: str | None
    teacher: TeacherResponse
    model_config = {"from_attributes": True}


class ScheduleCreate(BaseModel):
    section_id: int
    day_of_week: str
    start_time: str
    end_time: str


class ScheduleResponse(ScheduleCreate, TimestampedResponse):
    id: int
    model_config = {"from_attributes": True}
