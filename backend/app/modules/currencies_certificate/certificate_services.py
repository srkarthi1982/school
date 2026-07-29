from __future__ import annotations

import logging

import filetype
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

_CERTIFICATE_MAX_SIZE_BYTES = 200 * 1024 * 1024  # 200 MB
_CERTIFICATE_ALLOWED_TYPES: set[str] = {
    "application/pdf",
}


def _validate_pdf(file_bytes: bytes, content_type: str) -> None:
    """Validate that the uploaded file is a PDF within allowed size."""
    if content_type not in _CERTIFICATE_ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{content_type}' is not allowed. Only PDF is accepted.",
        )

    if len(file_bytes) > _CERTIFICATE_MAX_SIZE_BYTES:
        max_mb = _CERTIFICATE_MAX_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {max_mb} MB",
        )

    kind = filetype.guess(file_bytes)
    if kind is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unable to verify file type",
        )
    if kind.mime != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="File content does not match PDF type",
        )


def _build_certificate_url(course_master_id: int, storage_key: str) -> str:
    """Build absolute URL/path to a stored certificate file for frontend <object>."""
    return f"/api/v1/course-masters/{course_master_id}/currencies/certification-files/{storage_key}"
