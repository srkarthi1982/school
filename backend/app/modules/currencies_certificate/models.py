from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime
from sqlalchemy import Index

from app.core.database import Base, AuditedMixin, TimestampMixin
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.modules.course_master.models import CourseMaster
    from app.modules.course_info.models import MasterEnablingObjective, CourseInfoLessonCreationLesson
    from app.modules.currencies_certificate.models import MasterCourseFlightPackage


class CurrencyMaster(Base):
    """Lookup table for all available currencies.

    This is a static catalog that gets seeded from the frontend mock data.
    """
    __tablename__ = "currencies_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="green", server_default="green")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    master_course_currencies: Mapped[list["MasterCourseCurrency"]] = relationship(
        back_populates="currency",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<CurrencyMaster(id={self.id}, name={self.name!r})>"


class MasterCourseCurrency(TimestampMixin, Base):
    """Tracks selected currencies for a course master.

    One row per currency per course.
    """
    __tablename__ = "master_course_currencies"
    __table_args__ = (
        UniqueConstraint("course_master_id", "currency_master_id", name="uq_master_course_currency"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    currency_master_id: Mapped[int] = mapped_column(
        ForeignKey("currencies_master.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    course_master: Mapped["CourseMaster"] = relationship(
        back_populates="master_course_currencies",
    )
    currency: Mapped["CurrencyMaster"] = relationship(back_populates="master_course_currencies")


class MasterCourseCertificate(AuditedMixin, Base):
    """Stores certificate PDF files for a course master.

    One row per course master — new uploads replace the existing row.
    """
    __tablename__ = "master_course_certificates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)

    course_master: Mapped["CourseMaster"] = relationship(
        back_populates="master_course_certificates",
    )

    def __repr__(self) -> str:
        return f"<MasterCourseCertificate(id={self.id}, course_master_id={self.course_master_id})>"


class MasterCourseFlightPackage(TimestampMixin, Base):
    """One flight package block for a course master.

    Each package has a free-text name and an ordered list of task rows.
    ``position`` preserves the order in which packages are shown.
    """
    __tablename__ = "master_course_flight_packages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    course_master: Mapped["CourseMaster"] = relationship(
        back_populates="master_course_flight_packages",
    )
    tasks: Mapped[list["MasterCourseFlightPackageTask"]] = relationship(
        back_populates="package",
        cascade="all, delete-orphan",
        order_by="MasterCourseFlightPackageTask.position",
    )

    def __repr__(self) -> str:
        return f"<MasterCourseFlightPackage(id={self.id}, name={self.name!r})>"


class FlightTaskMaster(TimestampMixin, Base):
    """Shared catalog of flight tasks (Task No + Task Description).

    A task added in one flight package becomes selectable from every other
    package. Each row is a (task_no, task_description) pair; flight-package
    task rows reference these by id.
    """
    __tablename__ = "flight_task_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_no: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    task_description: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )

    package_tasks: Mapped[list["MasterCourseFlightPackageTask"]] = relationship(
        back_populates="task",
    )

    def __repr__(self) -> str:
        return f"<FlightTaskMaster(id={self.id}, task_no={self.task_no!r})>"


class MasterCourseFlightPackageTask(Base):
    """One task row inside a flight package — references a FlightTaskMaster."""
    __tablename__ = "master_course_flight_package_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    package_id: Mapped[int] = mapped_column(
        ForeignKey("master_course_flight_packages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_master_id: Mapped[int] = mapped_column(
        ForeignKey("flight_task_master.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    package: Mapped["MasterCourseFlightPackage"] = relationship(back_populates="tasks")
    task: Mapped["FlightTaskMaster"] = relationship(back_populates="package_tasks")


# ---------------------------------------------------------------------------
# Task Association
# ---------------------------------------------------------------------------
#
# The Task Association sub-tab links a flight task (drawn from this course's
# flight packages) to one or more Enabling Objectives (created in Course
# Information) and one or more selected currencies. Each association is one
# task plus two many-to-many child collections; packages are saved replace-all
# like flight packages.

class MasterCourseTaskAssociation(TimestampMixin, Base):
    """One task-association record for a course master.

    References a flight task in the shared catalog and owns the chosen EO and
    currency links. ``position`` preserves display order.
    """
    __tablename__ = "master_course_task_associations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_master_id: Mapped[int] = mapped_column(
        ForeignKey("flight_task_master.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    course_master: Mapped["CourseMaster"] = relationship(
        back_populates="master_course_task_associations",
    )
    task: Mapped["FlightTaskMaster"] = relationship()
    enabling_objectives: Mapped[list["MasterCourseTaskAssociationEO"]] = relationship(
        back_populates="association",
        cascade="all, delete-orphan",
    )
    currencies: Mapped[list["MasterCourseTaskAssociationCurrency"]] = relationship(
        back_populates="association",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<MasterCourseTaskAssociation(id={self.id}, task_master_id={self.task_master_id})>"


class MasterCourseTaskAssociationEO(Base):
    """An Enabling Objective linked to a task association."""
    __tablename__ = "master_course_task_association_eos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("master_course_task_associations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    enabling_objective_id: Mapped[int] = mapped_column(
        ForeignKey("master_enabling_objectives.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    association: Mapped["MasterCourseTaskAssociation"] = relationship(
        back_populates="enabling_objectives",
    )
    enabling_objective: Mapped["MasterEnablingObjective"] = relationship()


class MasterCourseTaskAssociationCurrency(Base):
    """A currency linked to a task association."""
    __tablename__ = "master_course_task_association_currencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("master_course_task_associations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    currency_master_id: Mapped[int] = mapped_column(
        ForeignKey("currencies_master.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    association: Mapped["MasterCourseTaskAssociation"] = relationship(
        back_populates="currencies",
    )
    currency: Mapped["CurrencyMaster"] = relationship()


# ---------------------------------------------------------------------------
# Flight Pack Association (master)
# ---------------------------------------------------------------------------

class MasterCourseFlightPackAssociation(TimestampMixin, Base):
    """One flight-pack-association record for a course master.

    Links a flight package (from this course's flight packages) to a set of
    lesson rows (from the master's Lesson Creation tab). ``position`` preserves
    display order. Seeded into the instance mirror so instances start with
    the same package-lesson structure the master configured.
    """

    __tablename__ = "master_course_flight_pack_associations"
    __table_args__ = (
        Index("ix_mcfpa_course_master_id", "course_master_id"),
        Index("ix_mcfpa_package_id", "package_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"),
        nullable=False,
    )
    package_id: Mapped[int] = mapped_column(
        ForeignKey("master_course_flight_packages.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    course_master: Mapped["CourseMaster"] = relationship(
        back_populates="master_course_flight_pack_associations",
    )
    package: Mapped["MasterCourseFlightPackage"] = relationship()
    lessons: Mapped[list["MasterCourseFlightPackAssociationLesson"]] = relationship(
        back_populates="association",
        cascade="all, delete-orphan",
        order_by="MasterCourseFlightPackAssociationLesson.position",
    )

    def __repr__(self) -> str:
        return f"<MasterCourseFlightPackAssociation(id={self.id}, package_id={self.package_id})>"


class MasterCourseFlightPackAssociationLesson(Base):
    """One lesson linked to a flight-pack association on the master.

    Each row references a lesson from the master's Lesson Creation tab
    (``course_info_lesson_creation_lessons``).
    """

    __tablename__ = "master_course_flight_pack_association_lessons"

    __table_args__ = (
        Index("ix_mcfpa_lesson_association_id", "association_id"),
        Index("ix_mcfpa_lesson_lesson_id", "lesson_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("master_course_flight_pack_associations.id", ondelete="CASCADE"),
        nullable=False,
    )
    lesson_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    association: Mapped["MasterCourseFlightPackAssociation"] = relationship(
        back_populates="lessons",
    )
    lesson: Mapped["CourseInfoLessonCreationLesson | None"] = relationship()
