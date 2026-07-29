from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.schemas import TimestampedResponse


QuizType = Literal["multiple_choice", "essay", "mixed", "true_false"]
QuestionType = Literal["multiple_choice", "essay", "true_false"]
ValidationStatus = Literal["pending", "approved", "rejected"]
Difficulty = Literal["easy", "medium", "difficult"]


class QuizQuestionCreate(BaseModel):
    description: str
    type: QuestionType
    difficulty: Difficulty = "medium"
    weight: int = Field(default=1, ge=0)
    choices: list[str] | None = None
    answers: list[str] = Field(default_factory=list)
    existing_question_id: int | None = None


class QuizQuestionUpdate(QuizQuestionCreate):
    pass


class QuizQuestionResponse(TimestampedResponse):
    id: int
    quiz_id: int
    description: str
    type: QuestionType
    difficulty: Difficulty
    weight: int
    order_index: int
    choices: list[str] | None
    answers: list[str]

    model_config = {"from_attributes": True}


class AttemptAnswer(BaseModel):
    question_id: int
    answer: list[str] = Field(default_factory=list)
    text: str | None = None


class QuizAttemptSubmit(BaseModel):
    answers: list[AttemptAnswer] = Field(default_factory=list)


class AttemptAnswerResult(BaseModel):
    question_id: int
    correct: bool
    awarded: int
    weight: int
    needs_review: bool = False
    answer: list[str] = Field(default_factory=list)
    text: str | None = None


class QuizAttemptResponse(BaseModel):
    id: int
    quiz_id: int
    quiz_name: str
    student_id: int
    score: int
    max_score: int
    has_essay: bool
    submitted_at: datetime
    results: list[AttemptAnswerResult] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class QuizCreate(BaseModel):
    name: str
    type: QuizType | None = None
    description: str | None = None
    weight: int = 0


class QuizUpdate(QuizCreate):
    pass


class QuizStatusUpdate(BaseModel):
    status: ValidationStatus


class QuizResponse(TimestampedResponse):
    id: int
    name: str
    type: QuizType | None = None
    description: str | None
    weight: int
    status: ValidationStatus
    questions: list[QuizQuestionResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class QuizTakerResponse(BaseModel):
    """A user eligible to receive a quiz (has quiz:take)."""

    id: int
    full_name: str | None = None
    email: str | None = None
    username: str | None = None

    model_config = {"from_attributes": True}


class RecipientsResponse(BaseModel):
    """Students a quiz is currently sent to, plus those who've already taken it
    (locked — they can't be unsent)."""

    student_ids: list[int] = Field(default_factory=list)
    completed_student_ids: list[int] = Field(default_factory=list)


class RecipientsUpdate(BaseModel):
    student_ids: list[int] = Field(default_factory=list)
