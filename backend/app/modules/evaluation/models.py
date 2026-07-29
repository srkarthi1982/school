from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class EvaluationLessonQuiz(TimestampMixin, Base):
    """Association linking a course lesson to a quiz within an Evaluation.

    Many-to-many: a lesson can have several quizzes and a quiz can be reused
    across lessons. ``lesson_id`` references the same lesson table the Material
    category uses (``course_info_lesson_creation_lessons``). A NULL ``lesson_id``
    means the quiz is associated with the course itself (the "course" row pinned
    on top of the lesson list).
    """

    __tablename__ = "evaluation_lesson_quizzes"
    __table_args__ = (
        UniqueConstraint(
            "course_master_id",
            "lesson_id",
            "quiz_id",
            name="uq_evaluation_lesson_quiz",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Per-association assessment configuration. ``assessment_type`` is
    # "theory" or "practical"; the marks/percentages drive grading. The
    # ``percentage_allocation`` of all quizzes in a lesson (or the course) must
    # not exceed 100 — enforced in the service layer.
    assessment_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    max_mark: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pass_mark: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pass_percentage: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    percentage_allocation: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    quiz = relationship("Quiz", lazy="joined")


class EvaluationLessonForm(TimestampMixin, Base):
    """Association linking a course lesson — or the whole course — to a form
    within an Evaluation.

    Mirrors :class:`EvaluationLessonQuiz` but targets the Form module and carries
    no per-association assessment config (a form is a plain attachment, like the
    Form Builder category's form links). A NULL ``lesson_id`` means the form is
    associated with the course itself (the "course" row pinned on top of the
    lesson list).
    """

    __tablename__ = "evaluation_lesson_forms"
    __table_args__ = (
        UniqueConstraint(
            "course_master_id",
            "lesson_id",
            "form_id",
            name="uq_evaluation_lesson_form",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    form_id: Mapped[int] = mapped_column(
        ForeignKey("forms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    form = relationship("Form", lazy="joined")


__all__ = ["EvaluationLessonQuiz", "EvaluationLessonForm"]
