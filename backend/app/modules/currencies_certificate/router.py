from __future__ import annotations

import os
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse as FastAPIFileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import ok, SuccessResponse

from app.modules.currencies_certificate import schemas
from app.modules.currencies_certificate import services
from app.modules.currencies_certificate.certificate_services import (
    _build_certificate_url,
)

router = APIRouter(
    prefix="/course-masters/{course_master_id}/currencies",
    tags=["Currencies"],
)


@router.get(
    "/available",
    response_model=SuccessResponse[list[schemas.CurrencyResponse]],
)
def list_available_currencies(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get all currencies from the master catalog."""
    currencies = services.get_available_currencies(db)
    return ok([
        schemas.CurrencyResponse.model_validate(c) for c in currencies
    ])


@router.get(
    "/selected",
    response_model=SuccessResponse[list[schemas.MasterCourseCurrencyResponse]],
)
def get_master_course_currencies(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get currencies selected for this course."""
    results = services.get_master_course_currencies(db, course_master_id)
    return ok([
        schemas.MasterCourseCurrencyResponse.model_validate(r) for r in results
    ])


@router.post(
    "/{tab_no}/complete",
    response_model=SuccessResponse[schemas.MasterCurrencyCertCompletionResponse],
)
def mark_currencies_cert_complete(
    course_master_id: int,
    tab_no: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Mark a single currencies-cert sub-tab as complete."""
    master = services.get_or_raise_currencies_master(db, course_master_id)
    services.set_currencies_cert_tab_status(db, master, tab_no, True, user.id)
    return ok(schemas.MasterCurrencyCertCompletionResponse(
        tab=tab_no,
        tab_status="complete",
        currencies_certificate_completion=master.currencies_certificate_completion,
    ))


@router.post(
    "/{tab_no}/incomplete",
    response_model=SuccessResponse[schemas.MasterCurrencyCertCompletionResponse],
)
def unmark_currencies_cert_complete(
    course_master_id: int,
    tab_no: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Unmark a single currencies-cert sub-tab."""
    master = services.get_or_raise_currencies_master(db, course_master_id)
    services.set_currencies_cert_tab_status(db, master, tab_no, False, user.id)
    return ok(schemas.MasterCurrencyCertCompletionResponse(
        tab=tab_no,
        tab_status="incomplete",
        currencies_certificate_completion=master.currencies_certificate_completion,
    ))


@router.post(
    "/selected",
    response_model=SuccessResponse[list[schemas.MasterCourseCurrencyResponse]],
)
def save_master_course_currencies(
    course_master_id: int,
    payload: schemas.SaveMasterCourseCurrenciesRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Update selected currencies for this course (replace all)."""
    results = services.save_master_course_currencies(
        db,
        course_master_id=course_master_id,
        currency_ids=payload.currency_ids,
    )
    return ok([
        schemas.MasterCourseCurrencyResponse.model_validate(r) for r in results
    ])


@router.get(
    "/certification",
    response_model=SuccessResponse[schemas.CertificateResponse],
)
def get_certificate(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CURCY_CERT_READ, PermissionCode.CURCY_CERT_WRITE)),
):
    """Get the certificate URL for a course master."""
    cert = services.get_certificate_by_master(db, course_master_id)
    if cert and cert.storage_key:
        return ok(schemas.CertificateResponse(
            certificateUrl=_build_certificate_url(course_master_id, cert.storage_key),
        ))
    return ok(schemas.CertificateResponse())


@router.post(
    "/certification/upload",
    response_model=SuccessResponse[schemas.CertificateResponse],
)
async def upload_certificate(
    course_master_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.CURCY_CERT_WRITE)),
):
    """Upload a certificate PDF directly to permanent storage."""
    file_bytes = await file.read()
    result = services.upload_certificate(
        db, course_master_id, file_bytes,
        file.filename or "unnamed", file.content_type or "application/octet-stream",
        user.id,
    )
    return ok(schemas.CertificateResponse(
        certificateUrl=_build_certificate_url(course_master_id, result["storage_key"]),
    ))


@router.get("/certification-files/{storage_key:path}")
def serve_certificate_file(storage_key: str):
    """Serve a stored certificate PDF file to the browser."""
    if not storage_key:
        raise HTTPException(status_code=404, detail="Certificate file not found")
    # Normalize storage_key to handle both forward and backslashes from URL
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
