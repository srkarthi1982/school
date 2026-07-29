from pydantic import BaseModel

from app.core.schemas import AuditedResponse


# --- Enrollment ---
class EnrollmentCreate(BaseModel):
    student_id: int
    section_id: int


class EnrollmentUpdate(BaseModel):
    version: int
    status: str | None = None
    grade: str | None = None
    grade_point: float | None = None


class EnrollmentResponse(AuditedResponse):
    id: int
    student_id: int
    section_id: int
    status: str
    grade: str | None
    grade_point: float | None
    model_config = {"from_attributes": True}
