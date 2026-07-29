from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.core.schemas import AuditedResponse


class CourseMasterBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    ctp_version: str | None = Field(default=None, max_length=100)
    course_date: date | None = None
    status: str = Field(default="draft", max_length=20)

    @field_validator("title", "ctp_version", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        # Trim surrounding whitespace so " Foo " and "Foo" can't sneak past the
        # (title, ctp_version) uniqueness rule, and so length checks see the real
        # value. Whitespace-only input collapses to "" and fails min_length.
        return v.strip() if isinstance(v, str) else v


class CourseMasterCreate(CourseMasterBase):
    # CTP Version is mandatory when creating a course.
    ctp_version: str = Field(min_length=1, max_length=100)


class CourseMasterClone(CourseMasterCreate):
    # The course master to deep-clone all relations from. The title / CTP
    # Version / course date below describe the *new* master and must satisfy the
    # same (title, CTP Version) uniqueness rule as a fresh create.
    source_master_id: int


class CourseMasterUpdate(CourseMasterBase):
    course_info_completion: int | None = Field(default=None, ge=0, le=100)
    material_completion: int | None = Field(default=None, ge=0, le=100)
    surveys_completion: int | None = Field(default=None, ge=0, le=100)
    evaluation_completion: int | None = Field(default=None, ge=0, le=100)
    schedule_completion: int | None = Field(default=None, ge=0, le=100)
    currencies_certificate_completion: int | None = Field(default=None, ge=0, le=100)


class CourseMasterResponse(CourseMasterBase, AuditedResponse):
    id: int
    course_info_completion: int
    material_completion: int
    surveys_completion: int
    evaluation_completion: int
    schedule_completion: int
    # Number of Course instances (Course Selection) spawned from this master.
    # Used by the Course Builder list and to block cancelling approval while
    # any linked course still exists.
    course_count: int = 0

    currencies_certificate_completion: int
    # Separate columns from the currencies/certificate bitmask above; the
    # frontend composes all three into the category's displayed percentage.
    flight_package_completion: int = 0
    task_association_completion: int = 0
    flight_pack_association_completion: int = 0
