from datetime import date

from pydantic import BaseModel, model_validator

from app.core.schemas import TimestampedResponse


# --- Academic Year ---
class AcademicYearCreate(BaseModel):
    name: str
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def end_after_start(self) -> "AcademicYearCreate":
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


AcademicYearUpdate = AcademicYearCreate  # alias — no version column on TimestampMixin


class AcademicYearResponse(AcademicYearCreate, TimestampedResponse):
    id: int
    model_config = {"from_attributes": True}


# --- Semester ---
class SemesterCreate(BaseModel):
    name: str
    type: str
    academic_year_id: int
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def end_after_start(self) -> "SemesterCreate":
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


SemesterUpdate = SemesterCreate  # alias — no version column on TimestampMixin


class SemesterResponse(SemesterCreate, TimestampedResponse):
    id: int
    model_config = {"from_attributes": True}
