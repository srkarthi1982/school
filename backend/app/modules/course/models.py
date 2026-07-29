import enum
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import AuditedMixin, Base, TimestampMixin


class CourseModificationRequestStatus(str, enum.Enum):
    WAIT_FOR_APPROVAL = "WAIT_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELED = "CANCELED"


course_instructors = Table(
    "course_instructors",
    Base.metadata,
    Column('course_instance_id',Integer,ForeignKey("course_instances.id",ondelete="CASCADE"),primary_key=True),
    Column('instructor_id',Integer,ForeignKey("profiles.id",ondelete="CASCADE"),primary_key=True),
)

class CourseInstance(AuditedMixin, Base):
    """A Course instance spawned from a CourseMaster.

    Class is named `CourseInstance` (matching the `course_instances` table) to
    avoid registry collision with the academic-catalog `Course` class in
    `app.modules.catalog.models`. The HTTP route is still `/courses` and the
    Pydantic schema names omit the `Instance` suffix.

    Inherits content defaults from its master; edits by non-admins go through
    `CourseModificationRequest` for admin approval (per spec §4).
    """

    __tablename__ = "course_instances"

    id: Mapped[int] = mapped_column(primary_key=True)
    master_id: Mapped[int] = mapped_column(ForeignKey("course_masters.id"))

    title: Mapped[str] = mapped_column(String(255))
    course_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Days already added to end_date via post-approval extensions. Cumulative
    # extensions are capped at 20% of the original period (see /extend route).
    extended_days: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Stop/resume bookkeeping: `stopped_at` anchors the gap computed on resume
    # (NULL unless status == "stopped"); `stopped_days` accumulates every past
    # gap so period math (e.g. the extend cap) can exclude on-hold time.
    stopped_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    stopped_days: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    class_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Completion columns mirror the instance detail-page categories
    # (Personnel, Course Information, Material, Form, Evaluation, Schedule).
    personnel_completion: Mapped[int] = mapped_column(Integer, default=0)
    course_info_completion: Mapped[int] = mapped_column(Integer, default=0)
    material_completion: Mapped[int] = mapped_column(Integer, default=0)
    surveys_completion: Mapped[int] = mapped_column(Integer, default=0)
    evaluation_completion: Mapped[int] = mapped_column(Integer, default=0)
    schedule_completion: Mapped[int] = mapped_column(Integer, default=0)

    # One-time guards: each of these categories seeds itself by copying the
    # master's data the first time it's opened, then edits independently.
    material_seeded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    surveys_seeded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    evaluation_seeded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    course_info_seeded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    schedule_seeded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    currencies_cert_seeded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    currencies_certificate_completion: Mapped[int] = mapped_column(Integer, default=0)
    # Flight Package and Task Association sub-tabs each seed independently from the
    # master and track their own completion (0 or 100), mirroring the master's
    # ``flight_package_completion`` / ``task_association_completion`` columns.
    flight_package_seeded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    task_association_seeded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    flight_package_completion: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    task_association_completion: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Flight Pack Association sub-tab completion (0 or 100).
    flight_pack_association_seeded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    flight_pack_association_completion: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    master: Mapped["CourseMaster"] = relationship(back_populates="courses")
    modification_requests: Mapped[list["CourseModificationRequest"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )

    enrollments: Mapped[list["CourseEnrollment"]] = relationship(
        back_populates="course",  passive_deletes=True)
    instructors: Mapped[list["Profile"]] = relationship(
        back_populates="teach_courses", secondary=course_instructors, passive_deletes=True)
    other_personnel: Mapped[list["CourseOtherPersonnel"]] = relationship(
        back_populates="course", cascade="all, delete-orphan", passive_deletes=True)
    material_folders: Mapped[list["CourseSelectionMaterialFolder"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True)
    material_files: Mapped[list["CourseSelectionMaterialFile"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True)
    form_survey_links: Mapped[list["CourseSelectionFormSurveyLink"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True)
    form_form_links: Mapped[list["CourseSelectionFormFormLink"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True)
    evaluation_quizzes: Mapped[list["CourseSelectionEvaluationLessonQuiz"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True)
    evaluation_forms: Mapped[list["CourseSelectionEvaluationLessonForm"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True)

    # Course Selection → Course Information category. Own typed tables, cloned
    # from the master on first open. Namespaced ``course_info_*`` to avoid
    # colliding with the other relationships above.
    course_info_general: Mapped["CourseSelectionInfoGeneralInformation | None"] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, back_populates="course")
    course_info_personnel_requirement: Mapped["CourseSelectionInfoPersonnelRequirement | None"] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, back_populates="course")
    course_info_resources: Mapped["CourseSelectionInfoResources | None"] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, back_populates="course")
    course_info_lesson_planning: Mapped["CourseSelectionInfoLessonPlanning | None"] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, back_populates="course")
    course_info_lesson_creation: Mapped["CourseSelectionInfoLessonCreation | None"] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, back_populates="course")
    # Course Selection → Currencies & Certificate category. Own tables cloned
    # from the master on first open (same lazy-seeding pattern as Material,
    # Form Builder, Evaluation and Course Information).
    selected_currencies: Mapped[list["CourseSelectionInfoCurrencySelected"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, back_populates="course")
    certificate: Mapped["CourseSelectionInfoCertificate | None"] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, back_populates="course")
    # Flight Package and Task Association mirror tables, cloned from the master on
    # first open (same lazy-seeding pattern as the rest of this category).
    flight_packages: Mapped[list["CourseSelectionInfoFlightPackage"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, back_populates="course",
        order_by="CourseSelectionInfoFlightPackage.position")
    task_associations: Mapped[list["CourseSelectionInfoTaskAssociation"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, back_populates="course",
        order_by="CourseSelectionInfoTaskAssociation.position")
    # Flight Pack Association mirror tables.
    flight_pack_associations: Mapped[list["CourseSelectionInfoFlightPackAssociation"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, back_populates="course",
        order_by="CourseSelectionInfoFlightPackAssociation.position")


class CourseModificationRequest(TimestampMixin, Base):
    """Pending edit on a Course; status moves to APPROVED before fields commit.

    Modeled after `ProfileModificationRequest` from app.modules.profile.
    The proposed changes are stored as JSON to keep the table schema stable
    as the editable fields evolve.
    """

    __tablename__ = "course_modification_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("course_instances.id"))
    requested_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    payload: Mapped[dict] = mapped_column(JSON)

    status: Mapped[CourseModificationRequestStatus] = mapped_column(
        String(20), default=CourseModificationRequestStatus.WAIT_FOR_APPROVAL
    )
    decided_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True)
    decision_note: Mapped[str | None] = mapped_column(
        String(500), nullable=True)

    course: Mapped["CourseInstance"] = relationship(
        back_populates="modification_requests")

    @property
    def is_open(self) -> bool:
        return self.status == CourseModificationRequestStatus.WAIT_FOR_APPROVAL

class CourseEnrollment(AuditedMixin, Base):
    __tablename__ = "course_enrollments"
    __table_args__ = (
        UniqueConstraint("student_id", "course_instance_id",
                         "enrollment_date", name="uq_student_enrollment"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"))
    student_id: Mapped[int] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"))
    enrollment_date: Mapped[DateTime | None] = mapped_column(
        DateTime, nullable=True)

    course: Mapped["CourseInstance"] = relationship(back_populates="enrollments")
    student: Mapped["Profile"] = relationship(back_populates="enrollments")


class CourseOtherPersonnel(AuditedMixin, Base):
    """Non-student, non-instructor staff attached to a course instance.

    Populated from the Personnel category's "Other Selection" tab — the
    user picks a profile AND the role that person fills on this course
    (role name from the `roles` table, stored denormalized as a string).
    """

    __tablename__ = "course_other_personnel"
    __table_args__ = (
        UniqueConstraint("course_instance_id", "profile_id",
                         name="uq_course_other_personnel"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"))
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(100))

    course: Mapped["CourseInstance"] = relationship(back_populates="other_personnel")
    profile: Mapped["Profile"] = relationship()


# class CourseInstructor(Base):
#     __tablename__ = "course_instructors"

#     course_instance_id: Mapped[int] = mapped_column(ForeignKey(
#         "course_instances.id", ondelete="CASCADE"), primary_key=True)
#     instructor_id: Mapped[int] = mapped_column(
#         ForeignKey("profiles.id", ondelete=True), primary_key=True)
