from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin

# Per-lesson lifecycle for a course instance's quiz/form/survey, used by Schedule
# Management lesson detail. A teacher RELEASES a content item to SPECIFIC students
# for a lesson (one row per targeted student); a student may take it only once it
# has been released to them, and a COMPLETION row marks that they've taken it for
# that lesson so they can't retake it there.
#
# ``content_type`` is one of 'quiz' | 'form' | 'survey'; ``content_id`` is the
# underlying quiz/form/survey id (NOT the association/link row id), so the state
# is stable even if the lesson association is re-created. ``student_id`` is the
# profile the item was released to — "send to all" is simply a row per enrolled
# student, and revoking from a student deletes that student's row.


class CourseSelectionLessonRelease(TimestampMixin, Base):
    __tablename__ = "course_selection_lesson_releases"
    __table_args__ = (
        UniqueConstraint(
            "course_instance_id",
            "lesson_id",
            "content_type",
            "content_id",
            "student_id",
            name="uq_cs_lesson_release",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[int] = mapped_column(
        ForeignKey(
            "course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    content_type: Mapped[str] = mapped_column(String(16), nullable=False)
    content_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # The student this content is released to. One row per targeted student.
    student_id: Mapped[int] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    released_by: Mapped[int | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    released_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class CourseSelectionLessonCompletion(TimestampMixin, Base):
    __tablename__ = "course_selection_lesson_completions"
    __table_args__ = (
        UniqueConstraint(
            "course_instance_id",
            "lesson_id",
            "content_type",
            "content_id",
            "student_id",
            name="uq_cs_lesson_completion",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[int] = mapped_column(
        ForeignKey(
            "course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    content_type: Mapped[str] = mapped_column(String(16), nullable=False)
    content_id: Mapped[int] = mapped_column(Integer, nullable=False)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_by_id: Mapped[int] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )


__all__ = ["CourseSelectionLessonRelease", "CourseSelectionLessonCompletion"]
