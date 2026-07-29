from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import text as sql_text
from sqlalchemy import text

from app.core.database import Base, TimestampMixin

from .schemas import (FormQuestionType, FormStatus)


class Form(TimestampMixin, Base):
    __tablename__ = "forms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Store the status as a string enum – default = draft
    status: Mapped[FormStatus] = mapped_column(
        String(32),
        nullable=False,
        server_default=text("'draft'"),
    )

    # When the form should be sent / becomes active (null = immediately)
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Link to a course (course engine). Also used for course-wide assignment.
    course_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("courses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # How the form is targeted: 'general' (everyone), 'course' (all students in
    # course_id), or 'user' (a single user identified by assignee_id).
    assignment_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text("'general'"),
    )

    # The specific user the form is assigned to when assignment_type == 'user'.
    assignee_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    questions: Mapped[list["FormQuestion"]] = relationship(
        "FormQuestion",
        back_populates="form",
        cascade="all, delete-orphan",
        order_by="FormQuestion.id",
        lazy="joined",
    )
    responses: Mapped[list["FormStudentResponse"]] = relationship(
        "FormStudentResponse",
        back_populates="form",
        cascade="all, delete-orphan",
        lazy="joined",
    )


class FormQuestionPool(TimestampMixin, Base):
    __tablename__ = "form_question_pool"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    type: Mapped[FormQuestionType] = mapped_column(
        String(32),
        nullable=False,
    )
    weight: Mapped[int] = mapped_column(Integer, nullable=False, server_default=None)

    required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=sql_text('false'),
        comment="Whether answering this question is mandatory",
    )

    allow_multiple: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=sql_text("'false'"),
        comment="Whether to show checkboxes (multiple) instead of radio (single)",
    )
    options: Mapped[list["FormPoolAnswerOption"]] = relationship(
        "FormPoolAnswerOption",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="FormPoolAnswerOption.id",
        lazy="joined",
    )


class FormPoolAnswerOption(TimestampMixin, Base):
    __tablename__ = "form_pool_answer_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    question_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("form_question_pool.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question: Mapped["FormQuestionPool"] = relationship(
        "FormQuestionPool", back_populates="options"
    )

    text: Mapped[str] = mapped_column(Text, nullable=False)

    weight: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        server_default=None,
        comment="Optional weight used for scoring; null = default 1",
    )


class FormQuestion(TimestampMixin, Base):
    __tablename__ = "form_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    form_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("forms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    form: Mapped["Form"] = relationship(
        "Form", back_populates="questions"
    )

    pool_question_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("form_question_pool.id", ondelete="SET NULL"),
        nullable=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)

    type: Mapped[FormQuestionType] = mapped_column(
        String(32),
        nullable=False,
    )

    weight: Mapped[int] = mapped_column(Integer, nullable=False, server_default=None)

    required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=sql_text('false'),
        comment="Whether answering this question is mandatory",
    )

    allow_multiple: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=sql_text("'false'"),
        comment="Whether to show checkboxes (multiple) instead of radio (single)",
    )

    options: Mapped[list["FormAnswerOption"]] = relationship(
        "FormAnswerOption",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="FormAnswerOption.id",
        lazy="joined",
    )


class FormAnswerOption(TimestampMixin, Base):
    __tablename__ = "form_answer_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    question_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("form_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question: Mapped["FormQuestion"] = relationship(
        "FormQuestion", back_populates="options"
    )

    text: Mapped[str] = mapped_column(Text, nullable=False)

    weight: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        server_default=None,
        comment="Optional weight used for scoring; null = default 1",
    )


class FormStudentResponse(TimestampMixin, Base):
    __tablename__ = "form_student_responses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    form_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("forms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id: Mapped[str] = mapped_column(Text, nullable=False)

    answers: Mapped[JSON] = mapped_column(JSON, nullable=True)

    # Per-question time spent, in seconds: { "<question_id>": <seconds> }
    question_times: Mapped[JSON] = mapped_column(JSON, nullable=True)

    started_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[DateTime] = mapped_column(DateTime, nullable=True)

    is_started: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_finished: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    current_index: Mapped[int] = mapped_column(Integer, nullable=True)
    overall_grade: Mapped[int] = mapped_column(Integer, nullable=True)

    form: Mapped["Form"] = relationship(
        "Form", back_populates="responses"
    )


class FormRecipient(TimestampMixin, Base):
    """A form sent directly to a student (independent of any course / lesson).

    student_id is a users.id (stored as Integer). Note FormStudentResponse.student_id
    is Text holding the same users.id — bridge the two in Python, not via SQL join.
    """

    __tablename__ = "form_recipients"
    __table_args__ = (
        UniqueConstraint("form_id", "student_id", name="uq_form_recipient"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    form_id: Mapped[int] = mapped_column(
        ForeignKey("forms.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    sent_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
