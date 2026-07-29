from datetime import datetime

from pydantic import BaseModel, Field

from app.core.schemas import AuditedResponse


class ScheduleEntryCreate(BaseModel):
    course_id: int | None = None
    start_at: datetime
    end_at: datetime
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    importance: int = Field(ge=1, le=10)


class ScheduleEntryUpdate(ScheduleEntryCreate):
    version: int


class ScheduleEntryResponse(AuditedResponse):
    id: int
    user_id: int
    course_id: int | None
    start_at: datetime
    end_at: datetime
    title: str
    description: str | None
    importance: int

    model_config = {"from_attributes": True}
