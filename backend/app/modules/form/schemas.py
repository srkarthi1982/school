from datetime import datetime
from typing import List, Optional, Literal, Any
from pydantic import BaseModel, Field, ConfigDict


FormQuestionType = Literal["text", "multiple", "rating", "true_false", "rating_with_text"]
FormStatus = Literal["draft", "published"]
FormAssignmentType = Literal["general", "course", "user"]


# -----------------------------------------------------------------
#  Answer Option schemas
# -----------------------------------------------------------------
class FormAnswerOptionBase(BaseModel):
    text: str
    weight: Optional[int] = None


class FormAnswerOptionCreate(FormAnswerOptionBase):
    id: Optional[int] = None
    question_id: Optional[int] = None


class FormAnswerOptionResponse(FormAnswerOptionBase):
    id: int
    question_id: int
    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------
#  Pool Answer Option schemas
# -----------------------------------------------------------------
class FormPoolAnswerOptionBase(BaseModel):
    text: str
    weight: Optional[int] = None


class FormPoolAnswerOptionCreate(FormPoolAnswerOptionBase):
    pass


class FormPoolAnswerOptionResponse(FormPoolAnswerOptionBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------
#  Form Question schemas
# -----------------------------------------------------------------
class FormQuestionBase(BaseModel):
    text: str
    type: FormQuestionType
    weight: int = 1
    required: bool = False
    allow_multiple: bool = False


class FormQuestionCreate(FormQuestionBase):
    pool_question_id: Optional[int] = None
    options: List[FormAnswerOptionCreate] = []


class FormQuestionResponse(FormQuestionBase):
    id: int
    form_id: int
    pool_question_id: Optional[int] = None
    options: List[FormAnswerOptionResponse] = []

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------
#  Form Question Pool schemas
# -----------------------------------------------------------------
class FormQuestionPoolBase(BaseModel):
    text: str
    type: FormQuestionType
    weight: int = 1
    required: bool = False
    allow_multiple: bool = False


class FormQuestionPoolCreate(FormQuestionPoolBase):
    options: Optional[List[FormPoolAnswerOptionCreate]] = []


class FormQuestionPoolResponse(FormQuestionPoolBase):
    id: int
    options: List[FormPoolAnswerOptionResponse] = []

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------
# Schemas for Form
# --------------------------------------------------
class FormBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "draft"
    scheduled_at: Optional[datetime] = None
    course_id: Optional[int] = None
    assignment_type: FormAssignmentType = "general"
    assignee_id: Optional[str] = None


class FormCreate(FormBase):
    questions: Optional[List[FormQuestionCreate]] = []


class FormUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    course_id: Optional[int] = None
    assignment_type: Optional[FormAssignmentType] = None
    assignee_id: Optional[str] = None


class FormResponse(FormBase):
    id: int
    questions: List[FormQuestionResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------
# Schemas for Student Responses
# --------------------------------------------------
class FormStudentResponseBase(BaseModel):
    form_id: int
    student_id: str
    answers: dict[str, Any] = {}
    question_times: Optional[dict[str, Any]] = None
    is_started: bool = False
    is_finished: bool = False
    current_index: Optional[int] = None
    overall_grade: Optional[int] = None


class FormStudentResponseCreate(FormStudentResponseBase):
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class FormStudentResponseUpdate(BaseModel):
    answers: Optional[dict[str, Any]] = None
    question_times: Optional[dict[str, Any]] = None
    is_started: Optional[bool] = None
    is_finished: Optional[bool] = None
    current_index: Optional[int] = None
    overall_grade: Optional[float] = None
    completed_at: Optional[datetime] = None


class FormStudentResponseResponse(FormStudentResponseBase):
    id: int
    started_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------
# Schema for form-eligible users (assignment combo box)
# --------------------------------------------------
class FormTakerResponse(BaseModel):
    id: int
    full_name: str
    email: str
    username: str

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------
# Schemas for sending a form directly to students
# --------------------------------------------------
class RecipientsResponse(BaseModel):
    """Students a form is currently sent to, plus those who've already finished it
    (locked — they can't be unsent)."""

    student_ids: List[int] = Field(default_factory=list)
    completed_student_ids: List[int] = Field(default_factory=list)


class RecipientsUpdate(BaseModel):
    student_ids: List[int] = Field(default_factory=list)
