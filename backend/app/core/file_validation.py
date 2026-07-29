from __future__ import annotations

import filetype
from fastapi import HTTPException, status


_MAGIC_TO_MIME = {
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "pdf": "application/pdf",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "mov": "video/quicktime",
    "avi": "video/x-msvideo",
}


def validate_uploaded_file(
    content_type: str,
    file_bytes: bytes,
    allowed_types: set[str],
    max_size_bytes: int,
) -> None:
    """Validate an uploaded file against an allow-list and size cap.

    Raises 415 for disallowed types or content/MIME mismatches, and 413 when
    the payload exceeds ``max_size_bytes``. Shared by File Sharing and the
    Course Builder Material module — keep them in lock-step to avoid drift on
    a security-sensitive check.
    """
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{content_type}' is not allowed",
        )

    if len(file_bytes) > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {max_mb} MB",
        )

    kind = filetype.guess(file_bytes)
    if kind is None:
        if not content_type.startswith("text/") and content_type != "application/json":
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unable to verify file type",
            )
        return

    expected = _MAGIC_TO_MIME.get(kind.extension, kind.mime)
    loosely_match = (
        expected == content_type
        or (expected == "image/jpeg" and content_type == "image/jpg")
        or (expected == "video/quicktime" and content_type == "video/mp4")
    )
    if not loosely_match:
        expected_major = expected.split("/")[0]
        declared_major = content_type.split("/")[0]
        if expected_major != declared_major:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"File content does not match declared type ({content_type})",
            )
