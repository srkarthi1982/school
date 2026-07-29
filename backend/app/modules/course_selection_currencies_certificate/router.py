from __future__ import annotations
import logging
import os
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse as FastAPIFileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import ok, SuccessResponse
from app.modules.course.models import CourseInstance

from . import schemas
from . import services

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/course-selection-currencies/{course_instance_id}",
    tags=["Course Selection Currencies & Certificate"],
)


# ─── Instance info (seed + completion) ────────────────────────────────────────

@router.get(
    "/info",
    response_model=SuccessResponse[schemas.InstanceInfoResponse],
)
def get_instance_info(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Seed from master (if needed) and return instance info including completion status."""
    course = services.get_or_raise_instance(db, course_instance_id)
    try:        
        services.seed_from_master(db, course)
    except Exception:
        if not course.currencies_cert_seeded : 
            logger.exception("Failed to seed instance info for %s", course_instance_id)
            raise
    finally:
        return ok(schemas.InstanceInfoResponse(
            course_title=course.title,
            course_master_status=course.status,
            currencies_cert_seeded=course.currencies_cert_seeded or False,
            currencies_certificate_completion=course.currencies_certificate_completion or 0,
			flight_package_completion=course.flight_package_completion or 0,
          	task_association_completion=course.task_association_completion or 0,
            flight_pack_association_completion=course.flight_pack_association_completion or 0,
        ))


# ─── Available currencies (read-only, shared with master) ────────────────────

@router.get(
    "/currencies/available",
    response_model=SuccessResponse[list[dict]],
)
def list_available_currencies(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get all currencies from the master catalog."""
    currencies = services.get_available_currencies(db)
    return ok(currencies)


# ─── Selected currencies ─────────────────────────────────────────────────────

@router.get(
    "/currencies/selected",
    response_model=SuccessResponse[list[schemas.InstanceCurrencySelectedResponse]],
)
def get_selected_currencies(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get currencies selected for this course selection instance."""
    course = db.get(CourseInstance, course_instance_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course selection not found")
    try:
        results = services.get_selected_currencies(db, course_instance_id)
        return ok([schemas.InstanceCurrencySelectedResponse.model_validate(r) for r in results])
    except Exception as e:
        logger.exception("Failed to get selected currencies for instance %s", course_instance_id)
        raise


@router.post(
    "/currencies/selected",
    response_model=SuccessResponse[list[schemas.InstanceCurrencySelectedResponse]],
)
def save_selected_currencies(
    course_instance_id: int,
    payload: schemas.SaveInstanceCurrenciesRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Update selected currencies for this instance (replace all)."""
    course = services.get_or_raise_instance(db, course_instance_id)
    results = services.save_selected_currencies(
        db,
        course_instance_id=course_instance_id,
        currency_ids=payload.currency_ids,
    )
    return ok([schemas.InstanceCurrencySelectedResponse.model_validate(r) for r in results])


# ─── Tab completion ──────────────────────────────────────────────────────────

@router.post(
    "/currencies/{tab_no}/complete",
    response_model=SuccessResponse[schemas.InstanceCurrencyCertCompletionResponse],
)
def mark_currencies_cert_complete(
    course_instance_id: int,
    tab_no: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Mark a single currencies-cert sub-tab as complete."""
    course = services.get_or_raise_instance(db, course_instance_id)
    completion = services.set_completion(db, course, tab_no, True)
    return ok(schemas.InstanceCurrencyCertCompletionResponse(
        tab=tab_no,
        tab_status="complete",
        currencies_certificate_completion=completion,
    ))


@router.post(
    "/currencies/{tab_no}/incomplete",
    response_model=SuccessResponse[schemas.InstanceCurrencyCertCompletionResponse],
)
def unmark_currencies_cert_complete(
    course_instance_id: int,
    tab_no: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Unmark a single currencies-cert sub-tab."""
    course = services.get_or_raise_instance(db, course_instance_id)
    completion = services.set_completion(db, course, tab_no, False)
    return ok(schemas.InstanceCurrencyCertCompletionResponse(
        tab=tab_no,
        tab_status="incomplete",
        currencies_certificate_completion=completion,
    ))


# ─── Certificate ─────────────────────────────────────────────────────────────

@router.get(
    "/currencies/certification",
    response_model=SuccessResponse[schemas.InstanceCertificateResponse],
)
def get_certificate(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get the certificate URL for this course selection instance."""
    course = db.get(CourseInstance, course_instance_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course selection not found")
    url = services.get_certificate_url(db, course_instance_id)
    return ok(schemas.InstanceCertificateResponse(certificateUrl=url))


@router.post(
    "/currencies/certification/upload",
    response_model=SuccessResponse[schemas.InstanceCertificateResponse],
)
async def upload_certificate(
    course_instance_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Upload a certificate PDF for this course selection instance."""
    course = services.get_or_raise_instance(db, course_instance_id)
    file_bytes = await file.read()
    result = services.upload_certificate(
        db, course_instance_id, file_bytes,
        file.filename or "unnamed", file.content_type or "application/octet-stream",
        user.id,
    )
    return ok(schemas.InstanceCertificateResponse(
        certificateUrl=result.get("certificateUrl"),
    ))


@router.get("/certification-files/{storage_key:path}")
def serve_certificate_file(storage_key: str):
    """Serve a stored certificate PDF file to the browser."""
    if not storage_key:
        raise HTTPException(status_code=404, detail="Certificate file not found")
    normalized_key = storage_key.replace('\\', os.sep).replace('/', os.sep)
    file_path = os.path.join(settings.MATERIAL_UPLOAD_DIR, normalized_key)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Certificate file not found")
    return FastAPIFileResponse(
        path=file_path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "inline",
            "Content-Type": "application/pdf",
        },
    )


# ─── Flight Package (instance) ────────────────────────────────────────────────

@router.get(
    "/flight-packages",
    response_model=SuccessResponse[list[schemas.InstanceFlightPackageResponse]],
)
def list_flight_packages(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get all flight packages (with their tasks) for this course selection instance."""
    course = services.get_or_raise_instance(db, course_instance_id)
    services.seed_from_master(db, course)
    results = services.get_flight_packages(db, course_instance_id)
    return ok([schemas.InstanceFlightPackageResponse.model_validate(r) for r in results])


@router.post(
    "/flight-packages",
    response_model=SuccessResponse[list[schemas.InstanceFlightPackageResponse]],
)
def save_flight_packages(
    course_instance_id: int,
    payload: schemas.SaveInstanceFlightPackagesRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Replace all flight packages for this instance."""
    course = services.get_or_raise_instance(db, course_instance_id)
    services.seed_from_master(db, course, user.id)
    results = services.save_flight_packages(db, course_instance_id, payload.packages)
    return ok([schemas.InstanceFlightPackageResponse.model_validate(r) for r in results])


@router.post(
    "/flight-packages/complete",
    response_model=SuccessResponse[schemas.InstanceFlightPackageCompletionResponse],
)
def mark_flight_package_complete(
    course_instance_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Mark the Flight Package sub-tab complete."""
    course = services.get_or_raise_instance(db, course_instance_id)
    services.seed_from_master(db, course, user.id)
    completion = services.set_flight_package_status(db, course, True)
    return ok(schemas.InstanceFlightPackageCompletionResponse(
        tab="flight",
        tab_status="complete",
        flight_package_completion=completion,
    ))


@router.post(
    "/flight-packages/incomplete",
    response_model=SuccessResponse[schemas.InstanceFlightPackageCompletionResponse],
)
def unmark_flight_package_complete(
    course_instance_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Unmark the Flight Package sub-tab."""
    course = services.get_or_raise_instance(db, course_instance_id)
    services.seed_from_master(db, course, user.id)
    completion = services.set_flight_package_status(db, course, False)
    return ok(schemas.InstanceFlightPackageCompletionResponse(
        tab="flight",
        tab_status="incomplete",
        flight_package_completion=completion,
    ))


# ─── Task Association (instance) ──────────────────────────────────────────────

@router.get(
    "/task-associations",
    response_model=SuccessResponse[list[schemas.InstanceTaskAssociationResponse]],
)
def list_task_associations(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get all task associations (with EO + currency links) for this instance."""
    course = services.get_or_raise_instance(db, course_instance_id)
    services.seed_from_master(db, course)
    results = services.get_task_associations(db, course_instance_id)
    return ok([schemas.InstanceTaskAssociationResponse.model_validate(r) for r in results])


@router.post(
    "/task-associations",
    response_model=SuccessResponse[list[schemas.InstanceTaskAssociationResponse]],
)
def save_task_associations(
    course_instance_id: int,
    payload: schemas.SaveInstanceTaskAssociationsRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Replace all task associations for this instance."""
    course = services.get_or_raise_instance(db, course_instance_id)
    services.seed_from_master(db, course, user.id)
    results = services.save_task_associations(db, course_instance_id, payload.associations)
    return ok([schemas.InstanceTaskAssociationResponse.model_validate(r) for r in results])


@router.get(
    "/task-associations/available-tasks",
    response_model=SuccessResponse[list[schemas.InstanceAvailableTaskResponse]],
)
def list_available_tasks(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Tasks selectable for association — drawn from this instance's flight packages."""
    course = services.get_or_raise_instance(db, course_instance_id)
    services.seed_from_master(db, course)
    results = services.get_available_tasks(db, course_instance_id)
    return ok([schemas.InstanceAvailableTaskResponse.model_validate(r) for r in results])


@router.get(
    "/task-associations/enabling-objectives",
    response_model=SuccessResponse[list[schemas.InstanceEnablingObjectiveOptionResponse]],
)
def list_enabling_objectives(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Enabling Objectives (created in Course Information) selectable for association."""
    results = services.list_enabling_objectives(db)
    return ok([schemas.InstanceEnablingObjectiveOptionResponse.model_validate(r) for r in results])


@router.post(
    "/task-associations/complete",
    response_model=SuccessResponse[schemas.InstanceTaskAssociationCompletionResponse],
)
def mark_task_association_complete(
    course_instance_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Mark the Task Association sub-tab complete."""
    course = services.get_or_raise_instance(db, course_instance_id)
    services.seed_from_master(db, course, user.id)
    completion = services.set_task_association_status(db, course, True)
    return ok(schemas.InstanceTaskAssociationCompletionResponse(
        tab="taskAssociation",
        tab_status="complete",
        task_association_completion=completion,
    ))


@router.post(
    "/task-associations/incomplete",
    response_model=SuccessResponse[schemas.InstanceTaskAssociationCompletionResponse],
)
def unmark_task_association_complete(
    course_instance_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Unmark the Task Association sub-tab."""
    course = services.get_or_raise_instance(db, course_instance_id)
    services.seed_from_master(db, course, user.id)
    completion = services.set_task_association_status(db, course, False)
    return ok(schemas.InstanceTaskAssociationCompletionResponse(
        tab="taskAssociation",
        tab_status="incomplete",
        task_association_completion=completion,
    ))


# ─── Flight Pack Association (instance) ───────────────────────────────────────

@router.get(
    "/flight-pack-associations",
    response_model=SuccessResponse[list[schemas.InstanceFlightPackAssociationResponse]],
)
def list_flight_pack_associations(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get all flight-pack-associations (with lesson links) for this instance."""
    course = services.get_or_raise_instance(db, course_instance_id)
    services.seed_flight_pack_associations(db, course)
    results = services.get_flight_pack_associations(db, course_instance_id)
    return ok([schemas.InstanceFlightPackAssociationResponse.model_validate(r) for r in results])


@router.post(
    "/flight-pack-associations",
    response_model=SuccessResponse[list[schemas.InstanceFlightPackAssociationResponse]],
)
def save_flight_pack_associations(
    course_instance_id: int,
    payload: schemas.SaveInstanceFlightPackAssociationsRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Replace all flight-pack associations for this instance."""
    results = services.save_flight_pack_associations(db, course_instance_id, payload.associations)
    return ok([schemas.InstanceFlightPackAssociationResponse.model_validate(r) for r in results])


@router.get(
    "/flight-pack-associations/available-packages",
    response_model=SuccessResponse[list[schemas.InstanceFlightPackTaskResponse]],
)
def list_available_packages_for_pack(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Packages selectable for flight-pack association — from this instance's flight packages."""
    results = services.get_available_packages(db, course_instance_id)
    return ok([schemas.InstanceFlightPackTaskResponse.model_validate(r) for r in results])


@router.get(
    "/flight-pack-associations/lessons",
    response_model=SuccessResponse[list[schemas.InstanceLessonOptionResponse]],
)
def list_lessons_for_pack(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Lessons selectable for flight-pack association — from course-selection course info."""
    results = services.get_available_lessons(db, course_instance_id)
    return ok([schemas.InstanceLessonOptionResponse.model_validate(r) for r in results])


@router.post(
    "/flight-pack-associations/complete",
    response_model=SuccessResponse[schemas.InstanceFlightPackAssociationCompletionResponse],
)
def mark_flight_pack_association_complete(
    course_instance_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Mark the Flight Pack Association sub-tab complete."""
    course = services.get_or_raise_instance(db, course_instance_id)
    completion = services.set_flight_pack_association_status(db, course, True)
    return ok(schemas.InstanceFlightPackAssociationCompletionResponse(
        tab="flightPackAssociation",
        tab_status="complete",
        flight_pack_association_completion=completion,
    ))


@router.post(
    "/flight-pack-associations/incomplete",
    response_model=SuccessResponse[schemas.InstanceFlightPackAssociationCompletionResponse],
)
def unmark_flight_pack_association_complete(
    course_instance_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Unmark the Flight Pack Association sub-tab."""
    course = services.get_or_raise_instance(db, course_instance_id)
    completion = services.set_flight_pack_association_status(db, course, False)
    return ok(schemas.InstanceFlightPackAssociationCompletionResponse(
        tab="flightPackAssociation",
        tab_status="incomplete",
        flight_pack_association_completion=completion,
    ))
