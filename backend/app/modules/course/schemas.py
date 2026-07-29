from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.schemas import AuditedResponse, TimestampedResponse


class CourseBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    course_date: date | None = None
    status: str = Field(default="draft", max_length=20)
    start_date: date | None = None
    end_date: date | None = None
    class_time: str | None = Field(default=None, max_length=50)
    location: str | None = Field(default=None, max_length=255)


class CourseCreate(CourseBase):
    master_id: int
    # Course Selection requires start and end dates when spawning an instance.
    start_date: date
    end_date: date


class CourseUpdate(CourseBase):
    personnel_completion: int | None = Field(default=None, ge=0, le=100)
    course_info_completion: int | None = Field(default=None, ge=0, le=100)
    material_completion: int | None = Field(default=None, ge=0, le=100)
    surveys_completion: int | None = Field(default=None, ge=0, le=100)
    evaluation_completion: int | None = Field(default=None, ge=0, le=100)
    schedule_completion: int | None = Field(default=None, ge=0, le=100)


class CourseResponse(CourseBase, AuditedResponse):
    id: int
    master_id: int
    personnel_completion: int
    course_info_completion: int
    material_completion: int
    surveys_completion: int
    evaluation_completion: int
    schedule_completion: int
    currencies_certificate_completion: int = 0
    # Separate columns from the currencies/certificate bitmask above; the
    # frontend composes all three into the category's displayed percentage.
    flight_package_completion: int = 0
    task_association_completion: int = 0
    flight_pack_association_completion: int = 0
    material_modified: bool = False
    surveys_modified: bool = False
    evaluation_modified: bool = False
    course_info_modified: bool = False
    currencies_cert_modified: bool = False
    currencies_cert_seeded: bool = False
    # Days already added via post-approval period extensions (cumulative cap:
    # 20% of the original period).
    extended_days: int = 0
    # Stop/resume: date the course was stopped (NULL unless status "stopped")
    # and total days spent on hold across all past stops.
    stopped_at: date | None = None
    stopped_days: int = 0


class CourseExtendRequest(BaseModel):
    """Extend an approved course's period by pushing end_date out N days."""

    additional_days: int = Field(ge=1)


class CourseModificationRequestCreate(BaseModel):
    payload: dict


class CourseModificationRequestDecision(BaseModel):
    decision_note: str | None = Field(default=None, max_length=500)


class CourseModificationRequestResponse(TimestampedResponse):
    id: int
    course_id: int
    requested_by_id: int | None
    payload: dict
    status: str
    decided_by_id: int | None
    decided_at: datetime | None
    decision_note: str | None


class MyCourseItemResponse(BaseModel):
    id: int
    code: str
    title: str
    outline: str
    students_count: int


class MyScheduleCourseItem(BaseModel):
    """A course instance the current user is a member of (enrolled as student or
    assigned as instructor), with dates — for the Schedule Management course
    picker. Distinct from MyCourseItemResponse (instructor-only, no dates)."""

    id: int
    title: str
    start_date: date | None = None
    end_date: date | None = None
    status: str
    role: str  # "student" | "instructor"


# ─── Personnel (Course Selection → Personnel category) ──────────────────────

class PersonnelMember(BaseModel):
    """One enrolled person on a course instance (any of the 3 tabs)."""

    profile_id: int
    full_name: str
    username: str | None = None
    rank: str | None = None
    email: str | None = None
    # Course role; only populated for "Other Selection" members added before
    # the role picker was dropped.
    role: str | None = None
    # The user's current system roles.
    roles: list[str] = []    

class PersonnelStudentMember(BaseModel):
    """One enrolled person on a course instance for attendances."""

    id: int
    full_name: str
    rank: str | None = None
    username: str | None = None
    # List of attendance records for the student (empty if none)
    attendances: list["AttendanceResponse"] = []
    # Base64‑encoded photo from the profile (if available)
    photo: str | None = None

class CoursePersonnelResponse(BaseModel):
    students: list[PersonnelMember]
    instructors: list[PersonnelMember]
    others: list[PersonnelMember]

class AttendanceResponse(BaseModel):
    """Attendance record for a student."""
    id: int
    date: date
    lesson_id: int | None = None
    status_id: int | None = None
    locked: bool
    level: int
    session_placement_id: int | None = None


class PersonnelAdd(BaseModel):
    profile_id: int


class OtherPersonnelAdd(PersonnelAdd):
    role: str | None = Field(None, max_length=100)


class PersonnelCandidate(BaseModel):
    """A profile that can be enrolled, with its user's role names."""

    profile_id: int
    full_name: str
    username: str | None = None
    rank: str | None = None
    email: str | None = None
    roles: list[str]
    # When the candidate is a student already enrolled in another non-closed
    # course, these identify it so the picker can block the selection
    # (rule: one student → one active course at a time).
    active_course_id: int | None = None
    active_course_title: str | None = None


class StudentProfileResponse(BaseModel):
    id: int
    username: str
    fullName: str
    rank: str
    qualification: str | None
    dateOfBirth: date | None
    country: str | None
    email: str
    mobileNo: str | None
    extNo: str | None
    primaryPlatform: str | None
    attendanceStatus: str | None

class LessonResponse(BaseModel):
    id: int
    title: str | None = None
    lesson_number: str | None = None

class PersonnelCourseResponse(BaseModel):
    id: int
    title: str | None = None