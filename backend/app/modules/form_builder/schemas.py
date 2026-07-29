from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FormBuilderResponse(BaseModel):
    id: int
    course_master_id: int
    title: str
    status: str
    course_master_status: str
    course_master_completion: int
    model_config = ConfigDict(from_attributes=True)


class FormBuilderStatusResponse(BaseModel):
    form_builder_id: int
    status: str
    course_master_completion: int


class FormBuilderLessonResponse(BaseModel):
    """One lesson the Form Builder is organised under.

    Sourced live from the Course Information → Lesson Creation step
    (``course_info_lesson_creation_lessons``); ``survey_count`` is the number of
    surveys associated with this lesson.
    """

    id: int
    lesson_number: str | None = None
    lesson_title: str | None = None
    order_index: int
    survey_count: int
    form_count: int


class FormBuilderLessonListResponse(BaseModel):
    items: list[FormBuilderLessonResponse]
    total: int


class FormBuilderSurveyResponse(BaseModel):
    """A survey linked to a lesson (or the course), flattened from the link + survey."""

    id: int  # association id (FormBuilderSurveyLink.id)
    survey_id: int
    lesson_id: int | None = None
    title: str
    description: str | None = None
    status: str
    question_count: int
    order_index: int
    created_at: datetime


class FormBuilderSurveyListResponse(BaseModel):
    items: list[FormBuilderSurveyResponse]
    total: int


class AssociateSurveyRequest(BaseModel):
    # ``lesson_id`` is None for a course-level association (the pinned course row).
    lesson_id: int | None = None
    survey_id: int


class FormBuilderFormResponse(BaseModel):
    """A form linked to a lesson (or the course), flattened from the link + form."""

    id: int  # association id (FormBuilderFormLink.id)
    form_id: int
    lesson_id: int | None = None
    title: str
    description: str | None = None
    status: str
    question_count: int
    order_index: int
    created_at: datetime


class FormBuilderFormListResponse(BaseModel):
    items: list[FormBuilderFormResponse]
    total: int


class AssociateFormRequest(BaseModel):
    # ``lesson_id`` is None for a course-level association (the pinned course row).
    lesson_id: int | None = None
    form_id: int
