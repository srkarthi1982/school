from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Boolean, Integer, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.modules.attendance_status.models import AttendanceStatus




class Attendance(TimestampMixin, Base):
    __tablename__ = "attendances"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # Added nullable foreign‑key to lesson creation table
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("course_selection_info_lesson_creation_lessons.id"), nullable=True)
    date: Mapped[date] = mapped_column(Date)
    # New foreign‑key to the attendance_status table
    status_id: Mapped[int | None] = mapped_column(ForeignKey("attendance_status.id"), nullable=True)
    # Specific scheduled session this attendance belongs to. A lesson can be placed
    # in multiple session schedules / multiple times, so attendance is scoped to the
    # concrete session-schedule placement (not just lesson+date). Null = legacy /
    # daily-attendance rows that predate per-session scoping.
    session_placement_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_session_schedule_placements.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    __table_args__ = (
        # Legacy / daily-attendance identity (no session): one per student+lesson+date.
        # Partial so it does NOT apply to session-scoped rows — the same lesson on the
        # same date can legitimately recur across different session placements.
        Index(
            "uq_attendance_record",
            "student_id",
            "lesson_id",
            "date",
            unique=True,
            postgresql_where=text("session_placement_id IS NULL"),
        ),
        # Session-scoped identity: one attendance per student per concrete session.
        Index(
            "uq_attendance_session_placement",
            "student_id",
            "session_placement_id",
            unique=True,
            postgresql_where=text("session_placement_id IS NOT NULL"),
        ),
    )

    # Cross-module string references
    # Relationship to the user who is the student
    student: Mapped["User"] = relationship(
        "User",
        back_populates="attendances",
        foreign_keys=[student_id],
        lazy="joined",
    )
    # Optional relationship to the lesson creation table
    lesson: Mapped["CourseSelectionInfoLessonCreationLesson"] = relationship("CourseSelectionInfoLessonCreationLesson", lazy="joined")
    # Optional relationship to the status lookup table
    status: Mapped["AttendanceStatus"] = relationship("AttendanceStatus", back_populates="attendances", lazy="joined")
