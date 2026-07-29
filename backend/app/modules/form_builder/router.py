from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.modules.form_builder.schemas import (
    AssociateFormRequest,
    AssociateSurveyRequest,
    FormBuilderFormListResponse,
    FormBuilderFormResponse,
    FormBuilderLessonListResponse,
    FormBuilderStatusResponse,
    FormBuilderSurveyListResponse,
    FormBuilderSurveyResponse,
)
from app.modules.form_builder.services import (
    associate_form,
    associate_survey,
    dissociate_form,
    dissociate_survey,
    get_or_raise_master,
    list_all_form_links,
    list_all_survey_links,
    list_form_builder_lessons,
    list_form_links,
    list_survey_links,
    set_form_builder_status,
)

router = APIRouter(prefix="/form-builders", tags=["Form Builder"])


# ---------------------------------------------------------------------------
# Form Builder status (per course master)
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
    master = get_or_raise_master(db, form_builder_id)
    set_form_builder_status(db, master, "complete", user.id)
    return ok(
        FormBuilderStatusResponse(
            form_builder_id=master.id,
            status="complete",
            course_master_completion=master.surveys_completion,
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
    master = get_or_raise_master(db, form_builder_id)
    set_form_builder_status(db, master, "incomplete", user.id)
    return ok(
        FormBuilderStatusResponse(
            form_builder_id=master.id,
            status="incomplete",
            course_master_completion=master.surveys_completion,
        )
    )


# ---------------------------------------------------------------------------
# Lessons (Form Builder is organised under the course's lessons)
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
    master = get_or_raise_master(db, form_builder_id)
    items = list_form_builder_lessons(db, master)
    return ok(FormBuilderLessonListResponse(items=items, total=len(items)))


# ---------------------------------------------------------------------------
# Survey links (lesson ↔ survey, or course ↔ survey when lesson_id omitted)
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
    master = get_or_raise_master(db, form_builder_id)
    items = list_survey_links(db, master, lesson_id)
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
    master = get_or_raise_master(db, form_builder_id)
    items = list_all_survey_links(db, master)
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
    master = get_or_raise_master(db, form_builder_id)
    link = associate_survey(db, master, data.lesson_id, data.survey_id)
    return ok(link)


@router.delete("/surveys/{link_id}", status_code=204)
def remove_survey_link(
    link_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_BUILDER_DELETE)),
):
    dissociate_survey(db, link_id)


# ---------------------------------------------------------------------------
# Form links (lesson ↔ form, or course ↔ form when lesson_id omitted)
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
    master = get_or_raise_master(db, form_builder_id)
    items = list_form_links(db, master, lesson_id)
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
    master = get_or_raise_master(db, form_builder_id)
    items = list_all_form_links(db, master)
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
    master = get_or_raise_master(db, form_builder_id)
    link = associate_form(db, master, data.lesson_id, data.form_id)
    return ok(link)


@router.delete("/forms/{link_id}", status_code=204)
def remove_form_link(
    link_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_BUILDER_DELETE)),
):
    dissociate_form(db, link_id)
