from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class QuizGrade(TimestampMixin, Base):
    """Per-question grading for a student quiz attempt."""

    __tablename__ = "quiz_grades"

    __table_args__ = (
        UniqueConstraint("quiz_id", "student_id", "question_id", name="uq_quiz_grade"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class SurveyGrade(TimestampMixin, Base):
    """Per-question grading for a student survey response."""

    __tablename__ = "survey_grades"

    __table_args__ = (
        UniqueConstraint(
            "survey_id", "student_id", "question_id",
            name="uq_survey_grade",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    survey_id: Mapped[int] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("survey_questions.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class FormGrade(TimestampMixin, Base):
    """Per-question grading for a student form response."""

    __tablename__ = "form_grades"

    __table_args__ = (
        UniqueConstraint(
            "form_id", "student_id", "question_id",
            name="uq_form_grade",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    form_id: Mapped[int] = mapped_column(
        ForeignKey("forms.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("form_questions.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class GradingProgress(TimestampMixin, Base):
    """Tracks per-student per-tab progress for each course."""

    __tablename__ = "grading_progress"

    __table_args__ = (
        UniqueConstraint(
            "course_id", "student_id", "grading_type",
            name="uq_grading_progress",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    grading_type: Mapped[str] = mapped_column(String(16), nullable=False)
    graded_count: Mapped[int] = mapped_column(Integer, default=0)
    total_count: Mapped[int] = mapped_column(Integer, default=0)


class FlightPackFillRecord(TimestampMixin, Base):
    """Stores fill data for a flight pack per student per course instance."""

    __tablename__ = "flight_pack_fills"

    __table_args__ = (
        UniqueConstraint(
            "course_instance_id", "student_id", "pack_id",
            name="uq_flight_pack_fill",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    pack_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_flight_package.id", ondelete="CASCADE"), index=True
    )
    student_name: Mapped[str] = mapped_column(String(255), default="")
    rank: Mapped[str] = mapped_column(String(20), default="CIVILIAN")

    date: Mapped[str] = mapped_column(String(10), default="")
    sortie_number: Mapped[str] = mapped_column(String(50), default="")
    sortie_detail: Mapped[str | None] = mapped_column(String(500), nullable=True)

    hour_day: Mapped[str] = mapped_column(String(20), default="")
    hour_night: Mapped[str] = mapped_column(String(20), default="")
    hour_nvg: Mapped[str] = mapped_column(String(20), default="")
    hour_total: Mapped[str] = mapped_column(String(20), default="")

    inst_simulated: Mapped[str] = mapped_column(String(20), default="")
    inst_actual: Mapped[str] = mapped_column(String(20), default="")
    inst_approaches: Mapped[str] = mapped_column(String(20), default="")
    inst_ils: Mapped[str] = mapped_column(String(20), default="")
    inst_vor: Mapped[str] = mapped_column(String(20), default="")

    grade_sortie: Mapped[str] = mapped_column(String(20), default="")
    grade_illum: Mapped[str] = mapped_column(String(20), default="")
    grade_weather: Mapped[str] = mapped_column(String(20), default="")


class FlightPackGrade(TimestampMixin, Base):
    """Per-task grading for a flight pack per student per course instance."""

    __tablename__ = "flight_pack_grades"

    __table_args__ = (
        UniqueConstraint(
            "course_instance_id", "student_id", "pack_id", "task_id",
            name="uq_flight_pack_grade",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    pack_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_flight_package.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_flight_package_task.id", ondelete="CASCADE"), index=True
    )
    satisfied: Mapped[bool | None] = mapped_column(nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)

