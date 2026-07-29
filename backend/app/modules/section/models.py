import enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import AuditedMixin, Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.course.models import CourseInstance


class DayOfWeek(str, enum.Enum):
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class Section(AuditedMixin, Base):
    __tablename__ = "sections"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20))
    course_id: Mapped[int] = mapped_column(ForeignKey("course_instances.id"))
    semester_id: Mapped[int] = mapped_column(ForeignKey("semesters.id"))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"))
    max_students: Mapped[int] = mapped_column(Integer, default=40)
    room: Mapped[str | None] = mapped_column(String(50), nullable=True)

    __table_args__ = (
        UniqueConstraint("code", "course_id", "semester_id", name="uq_section_course_semester"),
    )

    # Cross-module string references
    #course: Mapped["CourseInstance"] = relationship(back_populates="sections")
    semester: Mapped["Semester"] = relationship(back_populates="sections")
    # teacher: Mapped["Teacher"] = relationship(back_populates="sections")
    enrollments: Mapped[list["Enrollment"]] = relationship(back_populates="section")
    schedules: Mapped[list["Schedule"]] = relationship(back_populates="section")


class Schedule(TimestampMixin, Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(primary_key=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id"))
    day_of_week: Mapped[DayOfWeek] = mapped_column(Enum(DayOfWeek))
    start_time: Mapped[str] = mapped_column(String(5))
    end_time: Mapped[str] = mapped_column(String(5))

    section: Mapped["Section"] = relationship(back_populates="schedules")
