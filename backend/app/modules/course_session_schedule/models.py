from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreationLesson,
    )


class CourseSessionSchedule(TimestampMixin, Base):
    """Operational fork of a Course Instance's schedule.

    Created when the instance is APPROVED by copying its Course Selection
    (template) schedule. It stores real per-day dates and is edited
    independently — operational edits here (move/resize, add lessons, change
    dates) never touch the selection schedule. There is no separate "course
    session" entity; the head still refers to the course instance.

    ``last_modified_by`` / ``last_modified_at`` are null right after a copy/reset
    and get stamped by any user edit; they drive the re-approval keep/reset
    prompt (so an approver isn't silently clobbered).
    """

    __tablename__ = "course_session_schedules"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    # Calendar copied from the selection schedule at fork time: used to fill the
    # per-day dates and for an optional "regenerate dates". The per-day ``date``
    # on each day row is the display source of truth thereafter.
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    off_weekdays: Mapped[str | None] = mapped_column(String(50), nullable=True)
    holidays: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Operational-edit tracking. Null = untouched since the last copy/reset.
    last_modified_by: Mapped[int | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    last_modified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    days: Mapped[list["CourseSessionScheduleDay"]] = relationship(
        back_populates="schedule",
        cascade="all, delete-orphan",
        order_by="CourseSessionScheduleDay.order_index",
    )


class CourseSessionScheduleDay(TimestampMixin, Base):
    """One day row in a session schedule, holding placed lesson blocks.

    Unlike the selection schedule (where the date is computed on the client from
    the calendar), the session day stores its own real ``date`` — filled from the
    calendar at fork time, then individually editable (decoupled from the
    calendar formula).
    """

    __tablename__ = "course_session_schedule_days"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_session_schedule_id: Mapped[int] = mapped_column(
        ForeignKey("course_session_schedules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    date: Mapped[date | None] = mapped_column(Date, nullable=True)

    schedule: Mapped["CourseSessionSchedule"] = relationship(back_populates="days")
    placements: Mapped[list["CourseSessionSchedulePlacement"]] = relationship(
        back_populates="day",
        cascade="all, delete-orphan",
        order_by="CourseSessionSchedulePlacement.order_index",
    )


class CourseSessionSchedulePlacement(TimestampMixin, Base):
    """One lesson block placed on a session schedule day.

    ``lesson_id`` references the SAME instance Lesson Creation catalogue as the
    selection schedule (no remap) — the fork reuses the instance's lessons.
    """

    __tablename__ = "course_session_schedule_placements"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_session_schedule_day_id: Mapped[int] = mapped_column(
        ForeignKey("course_session_schedule_days.id", ondelete="CASCADE"),
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
    # Free-form time placement (the operational source of truth). start_minute is
    # minutes-from-midnight within the day row's date; duration_minute is the block
    # length. Unlike the selection/master schedule these are NOT quantized to
    # period columns, so a block can sit at any time / any duration.
    start_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=480)
    duration_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=45)
    # Legacy period-grid coordinates — kept (nullable) for rollback; no longer
    # written or read by the session schedule. The fork from the (grid) selection
    # schedule converts these into start_minute/duration_minute.
    start_col: Mapped[int | None] = mapped_column(Integer, nullable=True)
    span: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    day: Mapped["CourseSessionScheduleDay"] = relationship(back_populates="placements")
    lesson: Mapped["CourseSelectionInfoLessonCreationLesson"] = relationship()


__all__ = [
    "CourseSessionSchedule",
    "CourseSessionScheduleDay",
    "CourseSessionSchedulePlacement",
]
