from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class CourseSelectionFormSurveyLink(TimestampMixin, Base):
    """Survey↔lesson (or survey↔course) link owned by a Course Selection instance.

    Mirrors :class:`app.modules.form_builder.models.FormBuilderSurveyLink` but is
    keyed off ``course_instance_id``. Seeded by copying the master's links the
    first time the instance's Form category is opened, then edited independently.
    """

    __tablename__ = "course_selection_form_survey_links"
    __table_args__ = (
        UniqueConstraint(
            "course_instance_id",
            "lesson_id",
            "survey_id",
            name="uq_course_selection_form_survey_link",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    survey_id: Mapped[int] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    survey = relationship("Survey", lazy="joined")


class CourseSelectionFormFormLink(TimestampMixin, Base):
    """Form↔lesson (or form↔course) link owned by a Course Selection instance.

    Mirrors :class:`app.modules.form_builder.models.FormBuilderFormLink`.
    """

    __tablename__ = "course_selection_form_form_links"
    __table_args__ = (
        UniqueConstraint(
            "course_instance_id",
            "lesson_id",
            "form_id",
            name="uq_course_selection_form_form_link",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    form_id: Mapped[int] = mapped_column(
        ForeignKey("forms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    form = relationship("Form", lazy="joined")


__all__ = ["CourseSelectionFormSurveyLink", "CourseSelectionFormFormLink"]
