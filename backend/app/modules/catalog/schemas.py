from pydantic import BaseModel

from app.core.schemas import TimestampedResponse


# --- Department ---
class DepartmentCreate(BaseModel):
    code: str
    name: str
    description: str | None = None


DepartmentUpdate = DepartmentCreate  # alias — no version column on TimestampMixin


class DepartmentResponse(DepartmentCreate, TimestampedResponse):
    id: int
    model_config = {"from_attributes": True}


# --- Program ---
class ProgramCreate(BaseModel):
    code: str
    name: str
    degree_level: str
    department_id: int
    total_credits: int


ProgramUpdate = ProgramCreate  # alias — no version column on TimestampMixin


class ProgramResponse(ProgramCreate, TimestampedResponse):
    id: int
    model_config = {"from_attributes": True}


# --- Course ---
class CourseCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    credits: int
    department_id: int


CourseUpdate = CourseCreate  # alias — no version column on TimestampMixin


class CourseResponse(CourseCreate, TimestampedResponse):
    id: int
    model_config = {"from_attributes": True}
