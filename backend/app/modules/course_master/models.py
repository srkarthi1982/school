from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import AuditedMixin, Base

if TYPE_CHECKING:
    from app.modules.course_info.models import (
        CourseInfoGeneralInformation,
        CourseInfoLessonCreation,
        CourseInfoLessonPlanning,
        CourseInfoPersonnelRequirement,
        CourseInfoResources,
    )


class CourseMaster(AuditedMixin, Base):
    """Course Builder master/template record.

    Acts as the reusable template that Course instances are spawned from.
    The 5 completion columns mirror the 5 detail-page categories and are
    used by the UI to render the stacked progress bars.
    """

    __tablename__ = "course_masters"
    # A course is uniquely identified by its title + CTP Version, with the title
    # compared case-insensitively — a functional UNIQUE index on
    # ``(lower(title), ctp_version)``. NB: Postgres treats NULLs as distinct, so
    # rows with a NULL ctp_version are not constrained against each other.
    __table_args__ = (
        Index(
            "uq_course_masters_lower_title_ctp_version",
            text("lower(title)"),
            "ctp_version",
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    course_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    # CTP Version, edited on the Course Information → General tab.
    ctp_version: Mapped[str | None] = mapped_column(String(100), nullable=True)

    course_info_completion: Mapped[int] = mapped_column(Integer, default=0)
    material_completion: Mapped[int] = mapped_column(Integer, default=0)
    surveys_completion: Mapped[int] = mapped_column(Integer, default=0)
    evaluation_completion: Mapped[int] = mapped_column(Integer, default=0)
    schedule_completion: Mapped[int] = mapped_column(Integer, default=0)
    currencies_certificate_completion: Mapped[int] = mapped_column(Integer, default=0)
    # Completion for the Flight Package sub-tab (0 or 100). Stored separately
    # from currencies_certificate_completion so the existing 2-tab encoding and
    # the Course Selection mirror are left untouched.
    flight_package_completion: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Completion for the Task Association sub-tab (0 or 100). Stored separately,
    # mirroring flight_package_completion.
    task_association_completion: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Completion for the Flight Pack Association sub-tab (0 or 100).
    flight_pack_association_completion: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    courses: Mapped[list["CourseInstance"]] = relationship(back_populates="master")
    # The 5 Course Information tabs are stored as typed tables hanging directly
    # off the master (one row per master each). Deleting a master cascades to all.
    general: Mapped["CourseInfoGeneralInformation | None"] = relationship(
        back_populates="course_master",
        uselist=False,
        cascade="all, delete-orphan",
    )
    personnel_requirement: Mapped["CourseInfoPersonnelRequirement | None"] = relationship(
        back_populates="course_master",
        uselist=False,
        cascade="all, delete-orphan",
    )
    resources: Mapped["CourseInfoResources | None"] = relationship(
        back_populates="course_master",
        uselist=False,
        cascade="all, delete-orphan",
    )
    lesson_planning: Mapped["CourseInfoLessonPlanning | None"] = relationship(
        back_populates="course_master",
        uselist=False,
        cascade="all, delete-orphan",
    )
    lesson_creation: Mapped["CourseInfoLessonCreation | None"] = relationship(
        back_populates="course_master",
        uselist=False,
        cascade="all, delete-orphan",
    )

    # Currency & Certificate — these are managed through the
    # ``currencies_certificate`` submodule but FK'd directly on the master.
    if TYPE_CHECKING:
        from app.modules.currencies_certificate.models import (
            MasterCourseCurrency,
            MasterCourseCertificate,
            MasterCourseFlightPackage,
            MasterCourseFlightPackageTask,
            MasterCourseTaskAssociation,
            MasterCourseFlightPackAssociation,
        )

    master_course_currencies: Mapped[list["MasterCourseCurrency"]] = relationship(
        back_populates="course_master",
        cascade="all, delete-orphan",
    )
    master_course_certificates: Mapped[list["MasterCourseCertificate"]] = relationship(
        back_populates="course_master",
        cascade="all, delete-orphan",
    )
    master_course_flight_packages: Mapped[list["MasterCourseFlightPackage"]] = relationship(
        back_populates="course_master",
        cascade="all, delete-orphan",
        order_by="MasterCourseFlightPackage.position",
    )
    master_course_task_associations: Mapped[list["MasterCourseTaskAssociation"]] = relationship(
        back_populates="course_master",
        cascade="all, delete-orphan",
        order_by="MasterCourseTaskAssociation.position",
    )
    material_files: Mapped[list["MaterialFile"]] = relationship(
    cascade="all, delete-orphan", passive_deletes=True)

    master_course_flight_pack_associations: Mapped[list["MasterCourseFlightPackAssociation"]] = relationship(
        back_populates="course_master",
        cascade="all, delete-orphan",
        order_by="MasterCourseFlightPackAssociation.position",
    )
