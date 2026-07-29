from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FormBuilderResponse(BaseModel):
    id: int
    course_instance_id: int
    title: str
    status: str
    course_status: str
    surveys_completion: int
    # True when any survey/form link differs from the master; ``course_modified``
    # is the whole-course (non-lesson) scope specifically.
    modified: bool = False
    course_modified: bool = False
    model_config = ConfigDict(from_attributes=True)


class FormBuilderStatusResponse(BaseModel):
    form_builder_id: int
    status: str
    surveys_completion: int


class FormBuilderLessonResponse(BaseModel):
    """One lesson the Form category is organised under.

    Sourced live from the master's Course Information → Lesson Creation step;
    ``survey_count``/``form_count`` count the instance's own links.
    """

    id: int
    lesson_number: str | None = None
    lesson_title: str | None = None
    order_index: int
    survey_count: int
    form_count: int
    # True when this lesson's survey/form links differ from the master.
    modified: bool = False


class FormBuilderLessonListResponse(BaseModel):
    items: list[FormBuilderLessonResponse]
    total: int


class FormBuilderSurveyResponse(BaseModel):
    """A survey linked to a lesson (or the course), flattened from the link + survey."""

    id: int  # association id (CourseSelectionFormSurveyLink.id)
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

    id: int  # association id (CourseSelectionFormFormLink.id)
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
