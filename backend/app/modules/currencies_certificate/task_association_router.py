from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import ok, SuccessResponse

from app.modules.currencies_certificate import schemas
from app.modules.currencies_certificate import services

router = APIRouter(
    prefix="/course-masters/{course_master_id}/task-associations",
    tags=["Task Associations"],
)


@router.get(
    "",
    response_model=SuccessResponse[list[schemas.TaskAssociationResponse]],
)
def list_task_associations(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get all task associations (with EO + currency links) for a course master."""
    results = services.get_task_associations(db, course_master_id)
    return ok([schemas.TaskAssociationResponse.model_validate(r) for r in results])


@router.post(
    "",
    response_model=SuccessResponse[list[schemas.TaskAssociationResponse]],
)
def save_task_associations(
    course_master_id: int,
    payload: schemas.SaveTaskAssociationsRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Replace all task associations for this course master."""
    results = services.save_task_associations(db, course_master_id, payload.associations)
    return ok([schemas.TaskAssociationResponse.model_validate(r) for r in results])


@router.get(
    "/available-tasks",
    response_model=SuccessResponse[list[schemas.AvailableTaskResponse]],
)
def list_available_tasks(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Tasks selectable for association — drawn from this course's flight packages."""
    results = services.get_available_tasks(db, course_master_id)
    return ok([schemas.AvailableTaskResponse.model_validate(r) for r in results])


@router.get(
    "/enabling-objectives",
    response_model=SuccessResponse[list[schemas.EnablingObjectiveOptionResponse]],
)
def list_enabling_objectives(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Enabling Objectives (created in Course Information) selectable for association."""
    results = services.list_enabling_objectives(db)
    return ok([schemas.EnablingObjectiveOptionResponse.model_validate(r) for r in results])


@router.post(
    "/complete",
    response_model=SuccessResponse[schemas.TaskAssociationCompletionResponse],
)
def mark_task_association_complete(
    course_master_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Mark the Task Association sub-tab complete."""
    master = services.get_or_raise_currencies_master(db, course_master_id)
    services.set_task_association_status(db, master, True, user.id)
    return ok(schemas.TaskAssociationCompletionResponse(
        tab="taskAssociation",
        tab_status="complete",
        task_association_completion=master.task_association_completion,
    ))


@router.post(
    "/incomplete",
    response_model=SuccessResponse[schemas.TaskAssociationCompletionResponse],
)
def unmark_task_association_complete(
    course_master_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Unmark the Task Association sub-tab."""
    master = services.get_or_raise_currencies_master(db, course_master_id)
    services.set_task_association_status(db, master, False, user.id)
    return ok(schemas.TaskAssociationCompletionResponse(
        tab="taskAssociation",
        tab_status="incomplete",
        task_association_completion=master.task_association_completion,
    ))
