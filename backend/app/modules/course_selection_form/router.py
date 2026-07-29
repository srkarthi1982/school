from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.modules.course_selection_form.schemas import (
    AssociateFormRequest,
    AssociateSurveyRequest,
    FormBuilderFormListResponse,
    FormBuilderFormResponse,
    FormBuilderLessonListResponse,
    FormBuilderStatusResponse,
    FormBuilderSurveyListResponse,
    FormBuilderSurveyResponse,
)
from app.modules.course_selection_form.services import (
    associate_form,
    associate_survey,
    dissociate_form,
    dissociate_survey,
    get_or_raise_course,
    list_all_form_links,
    list_all_survey_links,
    list_form_builder_lessons,
    list_form_links,
    list_survey_links,
    set_form_builder_status,
)

router = APIRouter(prefix="/course-selection-form-builders", tags=["Course Selection Form"])


# ---------------------------------------------------------------------------
# Form status (per course instance)
# ---------------------------------------------------------------------------

@router.post(
    "/{form_builder_id}/complete",
    response_model=SuccessResponse[FormBuilderStatusResponse],
)
def mark_form_builder_complete(
    form_builder_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.FORM_BUILDER_WRITE)),
):
    course = get_or_raise_course(db, form_builder_id)
    set_form_builder_status(db, course, "complete", user.id)
    return ok(
        FormBuilderStatusResponse(
            form_builder_id=course.id,
            status="complete",
            surveys_completion=course.surveys_completion,
        )
    )


@router.post(
    "/{form_builder_id}/incomplete",
    response_model=SuccessResponse[FormBuilderStatusResponse],
)
def unmark_form_builder_complete(
    form_builder_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.FORM_BUILDER_WRITE)),
):
    course = get_or_raise_course(db, form_builder_id)
    set_form_builder_status(db, course, "incomplete", user.id)
    return ok(
        FormBuilderStatusResponse(
            form_builder_id=course.id,
            status="incomplete",
            surveys_completion=course.surveys_completion,
        )
    )


# ---------------------------------------------------------------------------
# Lessons
# ---------------------------------------------------------------------------

@router.get(
    "/{form_builder_id}/lessons",
    response_model=SuccessResponse[FormBuilderLessonListResponse],
)
def get_lessons(
    form_builder_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_BUILDER_READ)),
):
    course = get_or_raise_course(db, form_builder_id)
    items = list_form_builder_lessons(db, course)
    return ok(FormBuilderLessonListResponse(items=items, total=len(items)))


# ---------------------------------------------------------------------------
# Survey links
# ---------------------------------------------------------------------------

@router.get(
    "/{form_builder_id}/surveys",
    response_model=SuccessResponse[FormBuilderSurveyListResponse],
)
def get_survey_links(
    form_builder_id: int,
    lesson_id: int | None = Query(
        None, description="Omit for course-level associations"
    ),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_BUILDER_READ)),
):
    course = get_or_raise_course(db, form_builder_id)
    items = list_survey_links(db, course, lesson_id)
    return ok(FormBuilderSurveyListResponse(items=items, total=len(items)))


@router.get(
    "/{form_builder_id}/surveys/all",
    response_model=SuccessResponse[FormBuilderSurveyListResponse],
)
def get_all_survey_links(
    form_builder_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_BUILDER_READ)),
):
    """Every survey association across all lessons and the course itself."""
    course = get_or_raise_course(db, form_builder_id)
    items = list_all_survey_links(db, course)
    return ok(FormBuilderSurveyListResponse(items=items, total=len(items)))


@router.post(
    "/{form_builder_id}/surveys",
    response_model=SuccessResponse[FormBuilderSurveyResponse],
    status_code=201,
)
def post_survey_link(
    form_builder_id: int,
    data: AssociateSurveyRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_BUILDER_WRITE)),
):
    course = get_or_raise_course(db, form_builder_id)
    link = associate_survey(db, course, data.lesson_id, data.survey_id)
    return ok(link)


@router.delete("/surveys/{link_id}", status_code=204)
def remove_survey_link(
    link_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_BUILDER_DELETE)),
):
    dissociate_survey(db, link_id)


# ---------------------------------------------------------------------------
# Form links
# ---------------------------------------------------------------------------

@router.get(
    "/{form_builder_id}/forms",
    response_model=SuccessResponse[FormBuilderFormListResponse],
)
def get_form_links(
    form_builder_id: int,
    lesson_id: int | None = Query(
        None, description="Omit for course-level associations"
    ),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_BUILDER_READ)),
):
    course = get_or_raise_course(db, form_builder_id)
    items = list_form_links(db, course, lesson_id)
    return ok(FormBuilderFormListResponse(items=items, total=len(items)))


@router.get(
    "/{form_builder_id}/forms/all",
    response_model=SuccessResponse[FormBuilderFormListResponse],
)
def get_all_form_links(
    form_builder_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_BUILDER_READ)),
):
    """Every form association across all lessons and the course itself."""
    course = get_or_raise_course(db, form_builder_id)
    items = list_all_form_links(db, course)
    return ok(FormBuilderFormListResponse(items=items, total=len(items)))


@router.post(
    "/{form_builder_id}/forms",
    response_model=SuccessResponse[FormBuilderFormResponse],
    status_code=201,
)
def post_form_link(
    form_builder_id: int,
    data: AssociateFormRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_BUILDER_WRITE)),
):
    course = get_or_raise_course(db, form_builder_id)
    link = associate_form(db, course, data.lesson_id, data.form_id)
    return ok(link)


@router.delete("/forms/{link_id}", status_code=204)
def remove_form_link(
    link_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_BUILDER_DELETE)),
):
    dissociate_form(db, link_id)
