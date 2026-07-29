from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class Quiz(TimestampMixin, Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    weight: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="pending")

    questions: Mapped[list["QuizQuestion"]] = relationship(
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="QuizQuestion.order_index",
    )


class Question(TimestampMixin, Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    description: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(32))
    difficulty: Mapped[str] = mapped_column(String(16), default="medium")
    choices: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    answers: Mapped[list[str]] = mapped_column(JSON, default=list)


class QuizQuestion(TimestampMixin, Base):
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    weight: Mapped[int] = mapped_column(Integer, default=1)
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    quiz: Mapped["Quiz"] = relationship(back_populates="questions")
    question: Mapped["Question"] = relationship(lazy="joined")

    # Convenience proxies so existing call sites that read description/type/
    # difficulty/choices/answers off a QuizQuestion keep working, and so the
    # flat QuizQuestionResponse schema can serialise via from_attributes.
    @property
    def description(self) -> str:
        return self.question.description if self.question else ""

    @property
    def type(self) -> str:
        return self.question.type if self.question else ""

    @property
    def difficulty(self) -> str:
        return self.question.difficulty if self.question else "medium"

    @property
    def choices(self) -> list[str] | None:
        return self.question.choices if self.question else None

    @property
    def answers(self) -> list[str]:
        return self.question.answers if self.question else []


class QuizAttempt(TimestampMixin, Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[int] = mapped_column(Integer, default=0)
    max_score: Mapped[int] = mapped_column(Integer, default=0)
    has_essay: Mapped[bool] = mapped_column(default=False)
    answers: Mapped[list[dict]] = mapped_column(JSON, default=list)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    quiz: Mapped["Quiz"] = relationship()


class QuizRecipient(TimestampMixin, Base):
    """A quiz sent directly to a student (independent of any course / lesson).

    student_id is a users.id — matching QuizAttempt.student_id — so a student's
    "assigned" list and "already taken" check line up on the same identity.
    """

    __tablename__ = "quiz_recipients"
    __table_args__ = (
        UniqueConstraint("quiz_id", "student_id", name="uq_quiz_recipient"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    sent_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
