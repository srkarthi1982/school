from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreationLesson,
    )


class CourseSelectionSchedule(TimestampMixin, Base):
    """The schedule of a single Course Instance (Course Selection).

    Mirrors the Course Builder Schedule but is per-instance. Unlike the master
    schedule (which hangs day rows directly off the course with no hub), the
    instance schedule keeps a 1:1 hub row to store the calendar settings chosen
    when the user generates real dates: the start date, which weekdays are off
    (e.g. Sat/Sun) and any specific holiday dates to skip. Day labels (date +
    weekday) are computed on the client from these; only the calendar settings
    and the placements are persisted.
    """

    __tablename__ = "course_selection_schedules"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    # Calendar settings (null until the user runs "Generate dates").
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Weekdays that are days off, as a comma-separated list of Python weekday
    # numbers (Mon=0 … Sun=6), e.g. "5,6" for Sat+Sun. Empty/null = none.
    off_weekdays: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Specific holiday dates to skip, as a comma-separated list of ISO dates
    # (YYYY-MM-DD). Empty/null = none.
    holidays: Mapped[str | None] = mapped_column(Text, nullable=True)

    days: Mapped[list["CourseSelectionScheduleDay"]] = relationship(
        back_populates="schedule",
        cascade="all, delete-orphan",
        order_by="CourseSelectionScheduleDay.order_index",
    )


class CourseSelectionScheduleDay(TimestampMixin, Base):
    """One day row in an instance's schedule, holding placed lesson blocks.

    The grid SHAPE (periods/day, period duration, days/week, total days) is NOT
    stored; it is derived live from the instance's Course Information. The day's
    label (date + weekday, or "Day N" fallback) is computed on the client from
    the parent schedule's calendar settings and the row's position.
    """

    __tablename__ = "course_selection_schedule_days"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_schedule_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_schedules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    schedule: Mapped["CourseSelectionSchedule"] = relationship(back_populates="days")
    placements: Mapped[list["CourseSelectionSchedulePlacement"]] = relationship(
        back_populates="day",
        cascade="all, delete-orphan",
        order_by="CourseSelectionSchedulePlacement.order_index",
    )


class CourseSelectionSchedulePlacement(TimestampMixin, Base):
    """One lesson block placed on an instance schedule day.

    ``lesson_id`` references the INSTANCE's own Lesson Creation catalogue
    (``course_selection_info_lesson_creation_lessons``), not the master's.
    A lesson may be placed multiple times. ``start_col``/``span`` locate the
    block on the period lane (columns [start_col, start_col+span)).
    """

    __tablename__ = "course_selection_schedule_placements"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_schedule_day_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_schedule_days.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lesson_id: Mapped[int] = mapped_column(
        ForeignKey(
            "course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    start_col: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    span: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    day: Mapped["CourseSelectionScheduleDay"] = relationship(back_populates="placements")
    lesson: Mapped["CourseSelectionInfoLessonCreationLesson"] = relationship()


# Lesson content release/completion lifecycle (Schedule Management lesson detail).
# Imported here so `import_all_models` (which loads each module's `models`)
# registers them with Base.metadata for Alembic + relationship resolution.
from app.modules.course_selection_schedule.lesson_content_models import (  # noqa: E402,F401
    CourseSelectionLessonCompletion,
    CourseSelectionLessonRelease,
)

__all__ = [
    "CourseSelectionSchedule",
    "CourseSelectionScheduleDay",
    "CourseSelectionSchedulePlacement",
    "CourseSelectionLessonRelease",
    "CourseSelectionLessonCompletion",
]
