from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.modules.evaluation.schemas import (
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
from app.modules.evaluation.services import (
    associate_form,
    associate_quiz,
    dissociate_form,
    dissociate_quiz,
    get_or_raise_master,
    list_all_lesson_forms,
    list_all_lesson_quizzes,
    list_evaluation_lessons,
    list_lesson_forms,
    list_lesson_quizzes,
    set_evaluation_status,
    update_quiz_association,
)

router = APIRouter(prefix="/evaluations", tags=["Evaluation"])


# ---------------------------------------------------------------------------
# Evaluation status (per course master)
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
    master = get_or_raise_master(db, evaluation_id)
    set_evaluation_status(db, master, "complete", user.id)
    return ok(
        EvaluationStatusResponse(
            evaluation_id=master.id,
            status="complete",
            course_master_completion=master.evaluation_completion,
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
    master = get_or_raise_master(db, evaluation_id)
    set_evaluation_status(db, master, "incomplete", user.id)
    return ok(
        EvaluationStatusResponse(
            evaluation_id=master.id,
            status="incomplete",
            course_master_completion=master.evaluation_completion,
        )
    )


# ---------------------------------------------------------------------------
# Lessons (evaluation is organised under the course's lessons)
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
    master = get_or_raise_master(db, evaluation_id)
    items = list_evaluation_lessons(db, master)
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
    master = get_or_raise_master(db, evaluation_id)
    items = list_lesson_quizzes(db, master, lesson_id)
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
    master = get_or_raise_master(db, evaluation_id)
    items = list_all_lesson_quizzes(db, master)
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
    master = get_or_raise_master(db, evaluation_id)
    assoc = associate_quiz(db, master, data)
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
    master = get_or_raise_master(db, evaluation_id)
    items = list_lesson_forms(db, master, lesson_id)
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
    master = get_or_raise_master(db, evaluation_id)
    items = list_all_lesson_forms(db, master)
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
    master = get_or_raise_master(db, evaluation_id)
    link = associate_form(db, master, data.lesson_id, data.form_id)
    return ok(link)


@router.delete("/forms/{link_id}", status_code=204)
def remove_lesson_form(
    link_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.EVALUATION_DELETE)),
):
    dissociate_form(db, link_id)
