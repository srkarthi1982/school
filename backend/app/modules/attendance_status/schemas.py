from pydantic import BaseModel
from app.core.schemas import TimestampedResponse


class AttendanceStatusCreate(BaseModel):
    code: str
    name: str
    color: str | None = None


class AttendanceStatusUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    color: str | None = None


class AttendanceStatusResponse(AttendanceStatusCreate, TimestampedResponse):
    id: int
    model_config = {"from_attributes": True}