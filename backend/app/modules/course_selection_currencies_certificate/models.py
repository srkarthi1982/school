from sqlalchemy import (
    ForeignKey, Integer, String, Text, Index, DateTime, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from typing import TYPE_CHECKING

from app.core.database import Base, AuditedMixin, TimestampMixin

if TYPE_CHECKING:
    from app.modules.currencies_certificate.models import FlightTaskMaster, CurrencyMaster
    from app.modules.course_info.models import MasterEnablingObjective
    from app.modules.course_selection_info.models import CourseSelectionInfoLessonCreation


class CourseSelectionInfoCurrencySelected(Base):
    """Per-instance selected currencies.

    Mirrors ``MasterCourseCurrency`` but keyed on
    ``course_instance_id`` instead of ``course_master_id``.
    """

    __tablename__ = "course_selection_info_currency_selected"
    __table_args__ = (
        Index("ix_cscs_instance_id", "course_instance_id"),
        Index("ix_cscs_currency_id", "currency_master_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
        nullable=False,
    )
    currency_master_id: Mapped[int] = mapped_column(
        ForeignKey("currencies_master.id", ondelete="CASCADE"),
        nullable=False,
    )

    course: Mapped["CourseInstance"] = relationship(
        back_populates="selected_currencies",
    )


class CourseSelectionInfoCertificate(AuditedMixin, Base):
    """Per-instance certificate PDF storage.

    Mirrors ``MasterCourseCertificate`` but keyed on
    ``course_instance_id`` instead of ``course_master_id``.
    One row per course instance - new uploads replace the existing row.
    """

    __tablename__ = "course_selection_info_certificate"
    __table_args__ = (
        Index("ix_course_selection_info_certificate_course_instance_id", "course_instance_id", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
        nullable=False,
    )
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)

    course: Mapped["CourseInstance"] = relationship(
        back_populates="certificate",
    )


# ---------------------------------------------------------------------------
# Flight Package (per-instance mirror of MasterCourseFlightPackage)
# ---------------------------------------------------------------------------

class CourseSelectionInfoFlightPackage(TimestampMixin, Base):
    """One flight package block for a course instance.

    Mirrors ``MasterCourseFlightPackage`` but keyed on ``course_instance_id``.
    """

    __tablename__ = "course_selection_info_flight_package"
    __table_args__ = (
        Index("ix_csifp_instance_id", "course_instance_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    course: Mapped["CourseInstance"] = relationship(back_populates="flight_packages")
    tasks: Mapped[list["CourseSelectionInfoFlightPackageTask"]] = relationship(
        back_populates="package",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoFlightPackageTask.position",
    )


class CourseSelectionInfoFlightPackageTask(Base):
    """One task row inside an instance flight package — references the shared
    ``FlightTaskMaster`` catalog (global, same as the master)."""

    __tablename__ = "course_selection_info_flight_package_task"
    __table_args__ = (
        Index("ix_csifpt_package_id", "package_id"),
        Index("ix_csifpt_task_master_id", "task_master_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    package_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_flight_package.id", ondelete="CASCADE"),
        nullable=False,
    )
    task_master_id: Mapped[int] = mapped_column(
        ForeignKey("flight_task_master.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    package: Mapped["CourseSelectionInfoFlightPackage"] = relationship(back_populates="tasks")
    task: Mapped["FlightTaskMaster"] = relationship()


# ---------------------------------------------------------------------------
# Task Association (per-instance mirror of MasterCourseTaskAssociation)
# ---------------------------------------------------------------------------

class CourseSelectionInfoTaskAssociation(TimestampMixin, Base):
    """One task-association record for a course instance.

    Mirrors ``MasterCourseTaskAssociation`` but keyed on ``course_instance_id``.
    References the shared flight-task catalog and owns the chosen EO / currency
    links. EOs and currencies still reference the global master tables.
    """

    __tablename__ = "course_selection_info_task_association"
    __table_args__ = (
        Index("ix_csita_instance_id", "course_instance_id"),
        Index("ix_csita_task_master_id", "task_master_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
        nullable=False,
    )
    task_master_id: Mapped[int] = mapped_column(
        ForeignKey("flight_task_master.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    course: Mapped["CourseInstance"] = relationship(back_populates="task_associations")
    task: Mapped["FlightTaskMaster"] = relationship()
    enabling_objectives: Mapped[list["CourseSelectionInfoTaskAssociationEO"]] = relationship(
        back_populates="association",
        cascade="all, delete-orphan",
    )
    currencies: Mapped[list["CourseSelectionInfoTaskAssociationCurrency"]] = relationship(
        back_populates="association",
        cascade="all, delete-orphan",
    )


class CourseSelectionInfoTaskAssociationEO(Base):
    """An Enabling Objective linked to an instance task association."""

    __tablename__ = "course_selection_info_task_association_eo"
    __table_args__ = (
        Index("ix_csita_eo_association_id", "association_id"),
        Index("ix_csita_eo_enabling_objective_id", "enabling_objective_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_task_association.id", ondelete="CASCADE"),
        nullable=False,
    )
    enabling_objective_id: Mapped[int] = mapped_column(
        ForeignKey("master_enabling_objectives.id", ondelete="CASCADE"),
        nullable=False,
    )

    association: Mapped["CourseSelectionInfoTaskAssociation"] = relationship(
        back_populates="enabling_objectives",
    )
    enabling_objective: Mapped["MasterEnablingObjective"] = relationship()


class CourseSelectionInfoTaskAssociationCurrency(Base):
    """A currency linked to an instance task association."""

    __tablename__ = "course_selection_info_task_association_currency"
    __table_args__ = (
        Index("ix_csita_cur_association_id", "association_id"),
        Index("ix_csita_cur_currency_master_id", "currency_master_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_task_association.id", ondelete="CASCADE"),
        nullable=False,
    )
    currency_master_id: Mapped[int] = mapped_column(
        ForeignKey("currencies_master.id", ondelete="CASCADE"),
        nullable=False,
    )

    association: Mapped["CourseSelectionInfoTaskAssociation"] = relationship(
        back_populates="currencies",
    )
    currency: Mapped["CurrencyMaster"] = relationship()


# ---------------------------------------------------------------------------
# Flight Pack Association (per-instance link flight package tasks to lessons)
# ---------------------------------------------------------------------------

class CourseSelectionInfoFlightPackAssociation(TimestampMixin, Base):
    """One flight-pack-association record for a course instance.

    Links a flight package to one or more lessons (from
    ``course_selection_info_lesson_creation_lessons``).
    """

    __tablename__ = "course_selection_info_flight_pack_association"
    __table_args__ = (
        Index("ix_csifpa_instance_id", "course_instance_id"),
        Index("ix_csifpa_package_id", "package_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
        nullable=False,
    )
    package_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_flight_package.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    course: Mapped["CourseInstance"] = relationship(back_populates="flight_pack_associations")
    package: Mapped["CourseSelectionInfoFlightPackage"] = relationship()
    lessons: Mapped[list["CourseSelectionInfoFlightPackAssociationLesson"]] = relationship(
        back_populates="association",
        cascade="all, delete-orphan",
    )


class CourseSelectionInfoFlightPackAssociationLesson(Base):
    """A lesson linked to a flight-pack association."""

    __tablename__ = "course_selection_info_flight_pack_association_lesson"
    __table_args__ = (
        Index("ix_csifpa_lesson_association_id", "association_id"),
        Index("ix_csifpa_lesson_lesson_id", "lesson_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    association_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_flight_pack_association.id", ondelete="CASCADE"),
        nullable=False,
    )
    lesson_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=False,
    )

    association: Mapped["CourseSelectionInfoFlightPackAssociation"] = relationship(
        back_populates="lessons",
    )
    lesson: Mapped["CourseSelectionInfoLessonCreationLesson"] = relationship()
