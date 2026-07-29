from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.modules.course_selection_evaluation.schemas import (
    AssociateEvaluationFormRequest,
    AssociateQuizRequest,
    EvaluationFormListResponse,
    EvaluationFormResponse,
    EvaluationLessonListResponse,
    EvaluationQuizListResponse,
    EvaluationQuizResponse,
    EvaluationStatusResponse,
    UpdateQuizAssociationRequest,
)
from app.modules.course_selection_evaluation.services import (
    associate_form,
    associate_quiz,
    dissociate_form,
    dissociate_quiz,
    get_or_raise_course,
    list_all_lesson_forms,
    list_all_lesson_quizzes,
    list_evaluation_lessons,
    list_lesson_forms,
    list_lesson_quizzes,
    set_evaluation_status,
    update_quiz_association,
)

router = APIRouter(
    prefix="/course-selection-evaluations", tags=["Course Selection Evaluation"]
)


# ---------------------------------------------------------------------------
# Evaluation status (per course instance)
# ---------------------------------------------------------------------------

@router.post(
    "/{evaluation_id}/complete",
    response_model=SuccessResponse[EvaluationStatusResponse],
)
def mark_evaluation_complete(
    evaluation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.EVALUATION_WRITE)),
):
    course = get_or_raise_course(db, evaluation_id)
    set_evaluation_status(db, course, "complete", user.id)
    return ok(
        EvaluationStatusResponse(
            evaluation_id=course.id,
            status="complete",
            evaluation_completion=course.evaluation_completion,
        )
    )


@router.post(
    "/{evaluation_id}/incomplete",
    response_model=SuccessResponse[EvaluationStatusResponse],
)
def unmark_evaluation_complete(
    evaluation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.EVALUATION_WRITE)),
):
    course = get_or_raise_course(db, evaluation_id)
    set_evaluation_status(db, course, "incomplete", user.id)
    return ok(
        EvaluationStatusResponse(
            evaluation_id=course.id,
            status="incomplete",
            evaluation_completion=course.evaluation_completion,
        )
    )


# ---------------------------------------------------------------------------
# Lessons
# ---------------------------------------------------------------------------

@router.get(
    "/{evaluation_id}/lessons",
    response_model=SuccessResponse[EvaluationLessonListResponse],
)
def get_lessons(
    evaluation_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.EVALUATION_READ)),
):
    course = get_or_raise_course(db, evaluation_id)
    items = list_evaluation_lessons(db, course)
    return ok(EvaluationLessonListResponse(items=items, total=len(items)))


# ---------------------------------------------------------------------------
# Lesson ↔ Quiz associations
# ---------------------------------------------------------------------------

@router.get(
    "/{evaluation_id}/quizzes",
    response_model=SuccessResponse[EvaluationQuizListResponse],
)
def get_lesson_quizzes(
    evaluation_id: int,
    lesson_id: int | None = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.EVALUATION_READ)),
):
    course = get_or_raise_course(db, evaluation_id)
    items = list_lesson_quizzes(db, course, lesson_id)
    return ok(EvaluationQuizListResponse(items=items, total=len(items)))


@router.get(
    "/{evaluation_id}/quizzes/all",
    response_model=SuccessResponse[EvaluationQuizListResponse],
)
def get_all_lesson_quizzes(
    evaluation_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.EVALUATION_READ)),
):
    """Every quiz association across all lessons and the course itself."""
    course = get_or_raise_course(db, evaluation_id)
    items = list_all_lesson_quizzes(db, course)
    return ok(EvaluationQuizListResponse(items=items, total=len(items)))


@router.post(
    "/{evaluation_id}/quizzes",
    response_model=SuccessResponse[EvaluationQuizResponse],
    status_code=201,
)
def post_lesson_quiz(
    evaluation_id: int,
    data: AssociateQuizRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.EVALUATION_WRITE)),
):
    course = get_or_raise_course(db, evaluation_id)
    assoc = associate_quiz(db, course, data)
    return ok(assoc)


@router.patch(
    "/quizzes/{assoc_id}",
    response_model=SuccessResponse[EvaluationQuizResponse],
)
def patch_lesson_quiz(
    assoc_id: int,
    data: UpdateQuizAssociationRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.EVALUATION_WRITE)),
):
    assoc = update_quiz_association(db, assoc_id, data)
    return ok(assoc)


@router.delete("/quizzes/{assoc_id}", status_code=204)
def remove_lesson_quiz(
    assoc_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.EVALUATION_DELETE)),
):
    dissociate_quiz(db, assoc_id)


# ---------------------------------------------------------------------------
# Lesson ↔ Form associations (course ↔ form when lesson_id omitted)
# ---------------------------------------------------------------------------

@router.get(
    "/{evaluation_id}/forms",
    response_model=SuccessResponse[EvaluationFormListResponse],
)
def get_lesson_forms(
    evaluation_id: int,
    lesson_id: int | None = Query(
        None, description="Omit for course-level associations"
    ),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.EVALUATION_READ)),
):
    course = get_or_raise_course(db, evaluation_id)
    items = list_lesson_forms(db, course, lesson_id)
    return ok(EvaluationFormListResponse(items=items, total=len(items)))


@router.get(
    "/{evaluation_id}/forms/all",
    response_model=SuccessResponse[EvaluationFormListResponse],
)
def get_all_lesson_forms(
    evaluation_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.EVALUATION_READ)),
):
    """Every form association across all lessons and the course itself."""
    course = get_or_raise_course(db, evaluation_id)
    items = list_all_lesson_forms(db, course)
    return ok(EvaluationFormListResponse(items=items, total=len(items)))


@router.post(
    "/{evaluation_id}/forms",
    response_model=SuccessResponse[EvaluationFormResponse],
    status_code=201,
)
def post_lesson_form(
    evaluation_id: int,
    data: AssociateEvaluationFormRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.EVALUATION_WRITE)),
):
    course = get_or_raise_course(db, evaluation_id)
    link = associate_form(db, course, data.lesson_id, data.form_id)
    return ok(link)


@router.delete("/forms/{link_id}", status_code=204)
def remove_lesson_form(
    link_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.EVALUATION_DELETE)),
):
    dissociate_form(db, link_id)
