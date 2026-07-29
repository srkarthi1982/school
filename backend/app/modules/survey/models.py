from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import text as sql_text

from app.core.database import Base, TimestampMixin
from sqlalchemy import text

from .schemas import (SurveyQuestionType,SurveyStatus)

class Survey(TimestampMixin, Base):
    __tablename__ = "surveys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )

    # Store the status as a string enum – default = draft
    status: Mapped[SurveyStatus] = mapped_column(
        String(32),
        nullable=False,
        server_default=text("'draft'"),
    )

    # When the survey should be sent / becomes active (null = immediately)
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

    # How the survey is targeted: 'general' (everyone), 'course' (all students
    # in course_id), or 'user' (a single user identified by assignee_id).
    assignment_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text("'general'"),
    )

    # The specific user the survey is assigned to when assignment_type == 'user'.
    assignee_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    # -------------------------------------------------
    # Relationship – a Survey has many SurveyQuestion rows
    # -------------------------------------------------
    questions: Mapped[list["SurveyQuestion"]] = relationship(
        "SurveyQuestion",
        back_populates="survey",
        cascade="all, delete-orphan",   # delete questions when a survey is deleted
        order_by="SurveyQuestion.id",
        lazy="joined"
    )
    responses: Mapped[list["StudentResponse"]] = relationship(
        "StudentResponse",
        back_populates="survey",
        cascade="all, delete-orphan",   # delete questions when a survey is deleted
        lazy="joined"
    )

    

class SurveyQuestionPool(TimestampMixin,Base):
    __tablename__="survey_question_pool"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    type: Mapped[SurveyQuestionType] = mapped_column(
        String(32),                     
        nullable=False,
         
    )
    # Weight – you gave a default of 1 and made it non‑nullable.
    weight: Mapped[int] = mapped_column(Integer, nullable=False, server_default=None)

    # ---------- Boolean flags ----------
    # `required` – whether the user must answer this question
    required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=sql_text('false'),
        comment="Whether answering this question is mandatory",
    )

    # `allow_multiple` – show checkboxes instead of radios
    allow_multiple: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=sql_text("'false'"),
        comment="Whether to show checkboxes (multiple) instead of radio (single)",
    )
    # ---------- Relationship to answer options ----------
    options: Mapped[list["SurveyPoolAnswerOption"]] = relationship(
        "SurveyPoolAnswerOption",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="SurveyPoolAnswerOption.id",
        lazy="joined"
    )

class SurveyPoolAnswerOption(TimestampMixin, Base):
    __tablename__ = "survey_pool_answer_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # FK to the owning question
    question_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("survey_question_pool.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question: Mapped["SurveyQuestionPool"] = relationship(
        "SurveyQuestionPool", back_populates="options"
    )

    text: Mapped[str] = mapped_column(Text, nullable=False)

    # Optional weight for the answer option (mirrors the TS weight?).
    # If you never need it you can drop this column.
    weight: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        server_default=None,
        comment="Optional weight used for scoring; null = default 1",
    )

class SurveyQuestion(TimestampMixin, Base):
    __tablename__ = "survey_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # ---------- FK to parent Survey ----------
    survey_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("surveys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    survey: Mapped["Survey"] = relationship(
        "Survey", back_populates="questions"
    )

    pool_question_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("survey_question_pool.id", ondelete="SET NULL"),
        nullable=True
    )
    # ---------- Core fields ----------
    text: Mapped[str] = mapped_column(Text, nullable=False)

    # The enum that maps to the TS SurveyQuestionType
    type: Mapped[SurveyQuestionType] = mapped_column(
        String(32),                     
        nullable=False,
         
    )

    # Weight – you gave a default of 1 and made it non‑nullable.
    weight: Mapped[int] = mapped_column(Integer, nullable=False, server_default=None)

    # ---------- Boolean flags ----------
    # `required` – whether the user must answer this question
    required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=sql_text('false'),
        comment="Whether answering this question is mandatory",
    )

    # `allow_multiple` – show checkboxes instead of radios
    allow_multiple: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=sql_text("'false'"),
        comment="Whether to show checkboxes (multiple) instead of radio (single)",
    )

    # ---------- Relationship to answer options ----------
    options: Mapped[list["SurveyAnswerOption"]] = relationship(
        "SurveyAnswerOption",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="SurveyAnswerOption.id",
        lazy="joined"
    )



class SurveyAnswerOption(TimestampMixin, Base):
    __tablename__ = "survey_answer_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # FK to the owning question
    question_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("survey_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question: Mapped["SurveyQuestion"] = relationship(
        "SurveyQuestion", back_populates="options"
    )

    text: Mapped[str] = mapped_column(Text, nullable=False)

    # Optional weight for the answer option (mirrors the TS weight?).
    # If you never need it you can drop this column.
    weight: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        server_default=None,
        comment="Optional weight used for scoring; null = default 1",
    )



class StudentResponse(TimestampMixin,Base):
    __tablename__="survey_student_responses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    survey_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("surveys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id: Mapped[str] = mapped_column(Text, nullable=False)

    answers:Mapped[JSON]=mapped_column(JSON,nullable=True)

    # Per-question time spent, in seconds: { "<question_id>": <seconds> }
    question_times:Mapped[JSON]=mapped_column(JSON,nullable=True)

    started_at:Mapped[DateTime] = mapped_column(DateTime,nullable=False)
    completed_at:Mapped[DateTime] = mapped_column(DateTime,nullable=True)

    is_started:Mapped[bool]=mapped_column(Boolean,nullable=False,default=False)
    is_finished:Mapped[bool]=mapped_column(Boolean,nullable=False,default=False)

    current_index:Mapped[int]=mapped_column(Integer,nullable=True)
    overall_grade:Mapped[int]=mapped_column(Integer,nullable=True)

    survey: Mapped["Survey"] = relationship(
        "Survey", back_populates="responses"
    )


class SurveyRecipient(TimestampMixin, Base):
    """A survey sent directly to a student (independent of any course / lesson).

    student_id is a users.id (stored as Integer). StudentResponse.student_id is Text
    holding the same users.id — bridge the two in Python, not via SQL join.
    """

    __tablename__ = "survey_recipients"
    __table_args__ = (
        UniqueConstraint("survey_id", "student_id", name="uq_survey_recipient"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    survey_id: Mapped[int] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    sent_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

