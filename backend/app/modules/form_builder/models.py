from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class FormBuilderSurveyLink(TimestampMixin, Base):
    """Association linking a survey to a course lesson — or the whole course.

    Many-to-many: a lesson can have several surveys and a survey can be reused
    across lessons. ``lesson_id`` references the same lesson table the Material
    and Evaluation categories use (``course_info_lesson_creation_lessons``). A
    NULL ``lesson_id`` means the survey is associated with the course itself
    (the "course" row pinned on top of the lesson list).
    """

    __tablename__ = "form_builder_survey_links"
    __table_args__ = (
        UniqueConstraint(
            "course_master_id",
            "lesson_id",
            "survey_id",
            name="uq_form_builder_survey_link",
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
    survey_id: Mapped[int] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    survey = relationship("Survey", lazy="joined")


class FormBuilderFormLink(TimestampMixin, Base):
    """Association linking a form to a course lesson — or the whole course.

    Mirrors :class:`FormBuilderSurveyLink` but targets the Form module. A NULL
    ``lesson_id`` means the form is associated with the course itself (the
    "course" row pinned on top of the lesson list).
    """

    __tablename__ = "form_builder_form_links"
    __table_args__ = (
        UniqueConstraint(
            "course_master_id",
            "lesson_id",
            "form_id",
            name="uq_form_builder_form_link",
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


__all__ = ["FormBuilderSurveyLink", "FormBuilderFormLink"]
