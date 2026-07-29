from datetime import date

from pydantic import BaseModel

from app.core.schemas import TimestampedResponse


class AttendanceCreate(BaseModel):
    student_id: int
    lesson_id: int | None
    date: date
    status_id: int | None
    locked: bool
    level: int
    user_id: int
    # Concrete session-schedule placement this attendance is for (per-session scope).
    session_placement_id: int | None = None


class AttendanceResponse(AttendanceCreate, TimestampedResponse):
    id: int
    model_config = {"from_attributes": True}
