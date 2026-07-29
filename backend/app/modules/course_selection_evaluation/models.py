from __future__ import annotations

from sqlalchemy import ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class CourseSelectionEvaluationLessonQuiz(TimestampMixin, Base):
    """Lesson↔quiz (or course↔quiz) association owned by a Course Selection instance.

    Mirrors :class:`app.modules.evaluation.models.EvaluationLessonQuiz` but is
    keyed off ``course_instance_id``. Seeded by copying the master's associations
    the first time the instance's Evaluation category is opened, then edited
    independently (including the per-association assessment configuration).
    """

    __tablename__ = "course_selection_evaluation_lesson_quizzes"
    # Index names are given explicitly (and kept short) because the auto-generated
    # ``ix_<table>_<column>`` names would exceed Postgres' 63-char identifier limit.
    __table_args__ = (
        UniqueConstraint(
            "course_instance_id",
            "lesson_id",
            "quiz_id",
            name="uq_course_selection_evaluation_lesson_quiz",
        ),
        Index("ix_cs_eval_quiz_course_instance_id", "course_instance_id"),
        Index("ix_cs_eval_quiz_lesson_id", "lesson_id"),
        Index("ix_cs_eval_quiz_quiz_id", "quiz_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False
    )
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=True,
    )
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    assessment_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    max_mark: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pass_mark: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pass_percentage: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    percentage_allocation: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    quiz = relationship("Quiz", lazy="joined")


class CourseSelectionEvaluationLessonForm(TimestampMixin, Base):
    """Lesson↔form (or course↔form) association owned by a Course Selection instance.

    Mirrors :class:`app.modules.evaluation.models.EvaluationLessonForm` but is
    keyed off ``course_instance_id``. Seeded by copying the master's evaluation
    form associations the first time the instance's Evaluation category is opened,
    then edited independently. A form is a plain attachment — no assessment config.
    """

    __tablename__ = "course_selection_evaluation_lesson_forms"
    # Index names are given explicitly (and kept short) because the auto-generated
    # ``ix_<table>_<column>`` names would exceed Postgres' 63-char identifier limit.
    __table_args__ = (
        UniqueConstraint(
            "course_instance_id",
            "lesson_id",
            "form_id",
            name="uq_course_selection_evaluation_lesson_form",
        ),
        Index("ix_cs_eval_form_course_instance_id", "course_instance_id"),
        Index("ix_cs_eval_form_lesson_id", "lesson_id"),
        Index("ix_cs_eval_form_form_id", "form_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False
    )
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=True,
    )
    form_id: Mapped[int] = mapped_column(
        ForeignKey("forms.id", ondelete="CASCADE"), nullable=False
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    form = relationship("Form", lazy="joined")


__all__ = [
    "CourseSelectionEvaluationLessonQuiz",
    "CourseSelectionEvaluationLessonForm",
]
