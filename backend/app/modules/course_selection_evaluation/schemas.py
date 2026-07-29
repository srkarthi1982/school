from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EvaluationResponse(BaseModel):
    id: int
    course_instance_id: int
    title: str
    status: str
    course_status: str
    evaluation_completion: int
    # True when any quiz/form association differs from the master; ``course_modified``
    # is the whole-course (non-lesson) scope specifically.
    modified: bool = False
    course_modified: bool = False
    model_config = ConfigDict(from_attributes=True)


class EvaluationStatusResponse(BaseModel):
    evaluation_id: int
    status: str
    evaluation_completion: int


class EvaluationLessonResponse(BaseModel):
    """One lesson the instance's evaluation is organised under.

    Sourced live from the master's Course Information → Lesson Creation step;
    ``quiz_count`` counts the instance's own associations.
    """

    id: int
    lesson_number: str | None = None
    lesson_title: str | None = None
    order_index: int
    quiz_count: int
    form_count: int
    # True when this lesson's quiz/form associations differ from the master.
    modified: bool = False


class EvaluationLessonListResponse(BaseModel):
    items: list[EvaluationLessonResponse]
    total: int


class EvaluationQuizResponse(BaseModel):
    """A quiz associated with a lesson, flattened from the association + quiz."""

    id: int  # association id (CourseSelectionEvaluationLessonQuiz.id)
    quiz_id: int
    lesson_id: int | None  # None = associated with the whole course
    name: str
    description: str | None = None
    type: str | None = None
    status: str
    weight: int
    question_count: int
    order_index: int
    assessment_type: str | None = None
    max_mark: int
    pass_mark: int
    pass_percentage: int
    percentage_allocation: int
    created_at: datetime


class EvaluationQuizListResponse(BaseModel):
    items: list[EvaluationQuizResponse]
    total: int


class AssociateQuizRequest(BaseModel):
    lesson_id: int | None = None  # None = associate with the whole course
    quiz_id: int
    assessment_type: str | None = None  # "theory" | "practical"
    max_mark: int = Field(default=0, ge=0)
    pass_mark: int = Field(default=0, ge=0)
    pass_percentage: int = Field(default=0, ge=0, le=100)
    percentage_allocation: int = Field(default=0, ge=0, le=100)


class UpdateQuizAssociationRequest(BaseModel):
    assessment_type: str | None = None  # "theory" | "practical"
    max_mark: int = Field(default=0, ge=0)
    pass_mark: int = Field(default=0, ge=0)
    pass_percentage: int = Field(default=0, ge=0, le=100)
    percentage_allocation: int = Field(default=0, ge=0, le=100)


class EvaluationFormResponse(BaseModel):
    """A form linked to a lesson (or the course), flattened from the link + form."""

    id: int  # association id (CourseSelectionEvaluationLessonForm.id)
    form_id: int
    lesson_id: int | None = None  # None = associated with the whole course
    title: str
    description: str | None = None
    status: str
    question_count: int
    order_index: int
    created_at: datetime


class EvaluationFormListResponse(BaseModel):
    items: list[EvaluationFormResponse]
    total: int


class AssociateEvaluationFormRequest(BaseModel):
    # ``lesson_id`` is None for a course-level association (the pinned course row).
    lesson_id: int | None = None
    form_id: int
