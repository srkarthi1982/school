from datetime import date, datetime
import re

from pydantic import BaseModel, ConfigDict
from app.core.schemas import AuditedResponse
from app.modules.profile.models import Profile
from ..attendance.schemas import AttendanceResponse
from ..users.schemas import UserResponse

def to_camel(name: str) -> str:
    """Convert snake_case to camelCase"""
    return re.sub(r'_([a-z])', lambda m: m.group(1).upper(), name)


class SnakeCaseBaseModel(BaseModel):
    model_config = ConfigDict(
        by_alias=True,            # Use aliases for serialization
        populate_by_name=True,    # Accept both snake_case & camelCase on input
        alias_generator=to_camel,  # Auto-generate camelCase aliases
        # from_attributes=True
    )


class PersonalInformation(SnakeCaseBaseModel):
    full_name: str
    date_of_birth: datetime | None
    country: str | None
    email: str
    mobile_no: str | None = None
    ext_no: str | None = None
    photo: str | None = None
    digital_signature: str | None = None


class UserFitness(SnakeCaseBaseModel):
    status: str
    iso_prep: str
    limitation: str | None = None


class AIRFItem(SnakeCaseBaseModel):
    title: str
    published_date: date
    read_on_date: datetime | None = None
    status: str


class UserAIRF(SnakeCaseBaseModel):
    status: str
    items: list[AIRFItem]


class ExperienceItem(SnakeCaseBaseModel):
    platform: str
    minutes: int


class UserExperience(SnakeCaseBaseModel):
    items: list[ExperienceItem]


class CurrencyItem(SnakeCaseBaseModel):
    currency: str
    type: str
    category: str
    # period: str
    last_performed: date | None = None
    score: float | None = None
    next_due: date | None = None
    extended_to: date | None = None
    days_remaining: int | None = None
    status: str


class UserCurrency(SnakeCaseBaseModel):
    blocking_status: str
    no_go_status: str
    go_status: str
    items: list[CurrencyItem]

class TeachCourseItem(SnakeCaseBaseModel):
    id: int
    title: str | None = None

class UserProfileResponse(SnakeCaseBaseModel):
    profile_id: int
    version: int
    personal_information: PersonalInformation
    rank: str
    command: str | None = None
    qualification: str | None
    platforms: list[str]
    fitness: UserFitness | None
    airf: UserAIRF | None
    experience: UserExperience | None
    currency: UserCurrency | None
    teach_courses: list[TeachCourseItem] = []


class UserProfileUpdate(SnakeCaseBaseModel):
    profile_id: int
    version: int
    full_name: str
    date_of_birth: date | None
    country: str | None
    email: str
    mobile_no: str | None = None
    ext_no: str | None = None

    def is_modified(self, existing_profile: Profile) -> bool:
        return (
            self.full_name != existing_profile.full_name or 
            self.date_of_birth != existing_profile.date_of_birth or
            self.country != existing_profile.country or
            self.email != existing_profile.email or
            self.mobile_no != existing_profile.mobile_no or
            self.ext_no != existing_profile.ext_no
        )


# --- Student ---
class StudentCreate(BaseModel):
    student_id: str
    user_id: int
    program_id: int
    enrollment_date: date
    current_semester: int = 1


class StudentUpdate(StudentCreate):
    version: int


class StudentResponse(AuditedResponse):
    id: int
    student_id: str
    user_id: int
    program_id: int
    enrollment_date: date
    current_semester: int
    model_config = {"from_attributes": True}
    user: UserResponse
    attendances: list[AttendanceResponse] = []


# --- Teacher ---
class TeacherCreate(BaseModel):
    employee_id: str
    user_id: int
    department_id: int
    specialization: str | None = None


class TeacherUpdate(TeacherCreate):
    version: int


class TeacherResponse(AuditedResponse):
    id: int
    employee_id: str
    user_id: int
    department_id: int
    specialization: str | None
    model_config = {"from_attributes": True}
    user: UserResponse
