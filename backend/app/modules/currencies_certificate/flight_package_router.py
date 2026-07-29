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
    prefix="/course-masters/{course_master_id}/flight-packages",
    tags=["Flight Packages"],
)

# The flight-task catalog is shared across all course masters, so it lives at
# the API root rather than under a single master.
task_master_router = APIRouter(
    prefix="/flight-task-master",
    tags=["Flight Packages"],
)


@task_master_router.get(
    "",
    response_model=SuccessResponse[list[schemas.FlightTaskMasterResponse]],
)
def list_flight_task_master(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """List every task in the shared flight-task catalog."""
    results = services.list_flight_task_master(db)
    return ok([schemas.FlightTaskMasterResponse.model_validate(r) for r in results])


@task_master_router.post(
    "",
    response_model=SuccessResponse[schemas.FlightTaskMasterResponse],
)
def create_flight_task_master(
    payload: schemas.FlightTaskMasterCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Add a new task to the shared flight-task catalog (both fields required)."""
    result = services.create_flight_task_master(
        db, payload.task_no, payload.task_description, user.id,
    )
    return ok(schemas.FlightTaskMasterResponse.model_validate(result))


@router.get(
    "",
    response_model=SuccessResponse[list[schemas.FlightPackageResponse]],
)
def list_flight_packages(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get all flight packages (with their tasks) for a course master."""
    results = services.get_flight_packages(db, course_master_id)
    return ok([schemas.FlightPackageResponse.model_validate(r) for r in results])


@router.post(
    "",
    response_model=SuccessResponse[list[schemas.FlightPackageResponse]],
)
def save_flight_packages(
    course_master_id: int,
    payload: schemas.SaveFlightPackagesRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Replace all flight packages for this course master."""
    results = services.save_flight_packages(db, course_master_id, payload.packages)
    return ok([schemas.FlightPackageResponse.model_validate(r) for r in results])


@router.post(
    "/complete",
    response_model=SuccessResponse[schemas.FlightPackageCompletionResponse],
)
def mark_flight_package_complete(
    course_master_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Mark the Flight Package sub-tab complete."""
    master = services.get_or_raise_currencies_master(db, course_master_id)
    services.set_flight_package_status(db, master, True, user.id)
    return ok(schemas.FlightPackageCompletionResponse(
        tab="flight",
        tab_status="complete",
        flight_package_completion=master.flight_package_completion,
    ))


@router.post(
    "/incomplete",
    response_model=SuccessResponse[schemas.FlightPackageCompletionResponse],
)
def unmark_flight_package_complete(
    course_master_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Unmark the Flight Package sub-tab."""
    master = services.get_or_raise_currencies_master(db, course_master_id)
    services.set_flight_package_status(db, master, False, user.id)
    return ok(schemas.FlightPackageCompletionResponse(
        tab="flight",
        tab_status="incomplete",
        flight_package_completion=master.flight_package_completion,
    ))


# ─── Flight Pack Association (master) ────────────────────────────────────────

fpa_router = APIRouter(
    prefix="/course-masters/{course_master_id}/flight-pack-associations",
    tags=["Flight Pack Association"],
)


@fpa_router.get(
    "",
    response_model=SuccessResponse[list[schemas.FlightPackAssociationResponse]],
)
def list_flight_pack_associations(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get all flight-pack-associations (with lesson links) for a course master."""
    results = services.get_flight_pack_associations(db, course_master_id)
    return ok([schemas.FlightPackAssociationResponse.model_validate(r) for r in results])


@fpa_router.post(
    "",
    response_model=SuccessResponse[list[schemas.FlightPackAssociationResponse]],
)
def save_flight_pack_associations(
    course_master_id: int,
    payload: schemas.SaveFlightPackAssociationsRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Replace all flight-pack associations for this course master."""
    results = services.save_flight_pack_associations(db, course_master_id, payload.associations)
    return ok([schemas.FlightPackAssociationResponse.model_validate(r) for r in results])


@fpa_router.get(
    "/available-packages",
    response_model=SuccessResponse[list[schemas.AvailablePackageResponse]],
)
def list_available_packages_for_fpa(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Packages selectable for flight-pack association — from this course's flight packages."""
    results = services.get_available_packages(db, course_master_id)
    return ok([schemas.AvailablePackageResponse.model_validate(r) for r in results])


@fpa_router.get(
    "/lessons",
    response_model=SuccessResponse[list[schemas.LessonOptionResponse]],
)
def list_lessons_for_fpa(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Lessons selectable for flight-pack association — from the master's Lesson Creation tab."""
    results = services.get_available_lessons(db, course_master_id)
    return ok([schemas.LessonOptionResponse.model_validate(r) for r in results])


@fpa_router.post(
    "/complete",
    response_model=SuccessResponse[schemas.FlightPackAssociationCompletionResponse],
)
def mark_flight_pack_association_complete(
    course_master_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Mark the Flight Pack Association sub-tab complete."""
    master = services.get_or_raise_currencies_master(db, course_master_id)
    services.set_flight_pack_association_status(db, master, True, user.id)
    return ok(schemas.FlightPackAssociationCompletionResponse(
        tab="flightPackAssociation",
        tab_status="complete",
        flight_pack_association_completion=master.flight_pack_association_completion,
    ))


@fpa_router.post(
    "/incomplete",
    response_model=SuccessResponse[schemas.FlightPackAssociationCompletionResponse],
)
def unmark_flight_pack_association_complete(
    course_master_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Unmark the Flight Pack Association sub-tab."""
    master = services.get_or_raise_currencies_master(db, course_master_id)
    services.set_flight_pack_association_status(db, master, False, user.id)
    return ok(schemas.FlightPackAssociationCompletionResponse(
        tab="flightPackAssociation",
        tab_status="incomplete",
        flight_pack_association_completion=master.flight_pack_association_completion,
    ))
