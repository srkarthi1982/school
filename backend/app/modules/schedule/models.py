from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.course_info.models import CourseInfoLessonCreationLesson


class CourseScheduleDay(TimestampMixin, Base):
    """One day row in a course's schedule, holding placed lesson blocks.

    The Schedule category no longer has its own hub table — day rows hang
    directly off the CourseMaster via ``course_master_id``. The grid SHAPE
    (periods/day, period duration, days/week, total days) is NOT stored; it is
    derived live from the course's Course Information so the two can never
    drift. Only the actual placements teachers build are persisted.
    """

    __tablename__ = "course_schedule_days"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    day_label: Mapped[str] = mapped_column(String(50), nullable=False)

    placements: Mapped[list["CourseSchedulePlacement"]] = relationship(
        back_populates="day",
        cascade="all, delete-orphan",
        order_by="CourseSchedulePlacement.order_index",
    )


class CourseSchedulePlacement(TimestampMixin, Base):
    """One lesson block placed on a day.

    ``lesson_id`` references the course's Lesson Creation catalogue. Deleting a
    lesson there removes its placements (ON DELETE CASCADE). A lesson may be
    placed multiple times, so this is NOT unique. ``start_col``/``span`` locate
    the block on the period lane (columns [start_col, start_col+span)).
    ``description`` is a student-facing note; ``remarks`` is a separate
    instructor note.
    """

    __tablename__ = "course_schedule_placements"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_schedule_day_id: Mapped[int] = mapped_column(
        ForeignKey("course_schedule_days.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lesson_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_col: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    span: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    day: Mapped["CourseScheduleDay"] = relationship(back_populates="placements")
    lesson: Mapped["CourseInfoLessonCreationLesson"] = relationship()


__all__ = ["CourseScheduleDay", "CourseSchedulePlacement"]
