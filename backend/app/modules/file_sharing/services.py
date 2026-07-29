from __future__ import annotations
import logging
from pathlib import Path
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

import filetype

from app.core.config import settings
from app.modules.file_sharing.models import SharedFile, SharedFolder
from app.modules.file_sharing.schemas import (
    BreadcrumbItem,
    FileResponse,
    FolderResponse,
    UploadResponse,
    UserReference,
)
from app.modules.file_sharing.storage import get_storage_backend

logger = logging.getLogger(__name__)
storage = get_storage_backend()


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _safe_filename(name: str) -> str:
    return Path(name).name


def validate_uploaded_file(content_type: str, file_bytes: bytes) -> None:
    if content_type not in settings.FILE_SHARING_ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{content_type}' is not allowed",
        )

    if len(file_bytes) > settings.FILE_SHARING_MAX_FILE_SIZE_BYTES:
        max_mb = settings.FILE_SHARING_MAX_FILE_SIZE_BYTES // (1024 * 1024)
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

    magic_to_mime = {
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
    expected = magic_to_mime.get(kind.extension, kind.mime)
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


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------

def create_folder(db: Session, name: str, parent_id: UUID | None, created_by_id: int) -> SharedFolder:
    if parent_id:
        parent = db.get(SharedFolder, parent_id)
        if not parent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found")

    # Check duplicate name in same parent
    stmt = select(SharedFolder).where(
        SharedFolder.name == name,
        SharedFolder.parent_id == parent_id,
    )
    existing = db.execute(stmt).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A folder with this name already exists here")

    folder = SharedFolder(name=name, parent_id=parent_id, created_by_id=created_by_id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def list_folders(db: Session, parent_id: UUID | None, order: str = "asc") -> list[SharedFolder]:
    stmt = select(SharedFolder).where(SharedFolder.parent_id == parent_id)
    if order == "desc":
        stmt = stmt.order_by(SharedFolder.name.desc())
    else:
        stmt = stmt.order_by(SharedFolder.name.asc())
    result = db.execute(stmt)
    return list(result.scalars().all())


def _delete_folder_recursive(db: Session, folder: SharedFolder) -> None:
    """Recursively delete subfolders and files, plus their physical storage."""
    # Delete files in this folder
    for file in list(folder.files):
        try:
            storage.delete(file.storage_key)
            if file.thumbnail_key:
                storage.delete(file.thumbnail_key)
        except Exception:
            logger.exception("Failed to delete file storage for %s", file.id)
        db.delete(file)

    # Recurse into children
    for child in list(folder.children):
        _delete_folder_recursive(db, child)

    db.delete(folder)


def delete_folder(db: Session, folder_id: UUID, current_user_id: int, is_admin: bool) -> None:
    folder = db.get(SharedFolder, folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    if not is_admin and folder.created_by_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete folders you created")

    _delete_folder_recursive(db, folder)
    db.commit()


def rename_folder(db: Session, folder_id: UUID, name: str, current_user_id: int, is_admin: bool) -> SharedFolder:
    folder = db.get(SharedFolder, folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    if not is_admin and folder.created_by_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only rename folders you created")

    # Check duplicate name in same parent
    stmt = select(SharedFolder).where(
        SharedFolder.name == name,
        SharedFolder.parent_id == folder.parent_id,
        SharedFolder.id != folder_id,
    )
    if db.execute(stmt).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A folder with this name already exists here")

    folder.name = name
    db.commit()
    db.refresh(folder)
    return folder


def build_breadcrumb(db: Session, folder_id: UUID) -> list[BreadcrumbItem]:
    breadcrumb: list[BreadcrumbItem] = []
    current_id: UUID | None = folder_id
    visited: set[UUID] = set()

    while current_id and current_id not in visited:
        visited.add(current_id)
        folder = db.get(SharedFolder, current_id)
        if not folder:
            break
        breadcrumb.append(BreadcrumbItem(id=folder.id, name=folder.name))
        current_id = folder.parent_id

    breadcrumb.reverse()
    return breadcrumb


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

def save_uploaded_file(file_bytes: bytes, filename: str, content_type: str) -> tuple[str, str | None]:
    validate_uploaded_file(content_type, file_bytes)
    return storage.save(file_bytes, filename, content_type)


def create_file_record(
    db: Session,
    folder_id: UUID | None,
    uploader_id: int,
    filename: str,
    content_type: str,
    file_size: int,
    storage_key: str,
    thumbnail_key: str | None,
) -> SharedFile:
    if folder_id:
        folder = db.get(SharedFolder, folder_id)
        if not folder:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    file_record = SharedFile(
        folder_id=folder_id,
        uploader_id=uploader_id,
        filename=filename,
        content_type=content_type,
        file_size=file_size,
        storage_key=storage_key,
        thumbnail_key=thumbnail_key,
    )
    db.add(file_record)
    db.commit()
    db.refresh(file_record)
    return file_record


def list_files(db: Session, folder_id: UUID | None, limit: int, offset: int) -> tuple[list[SharedFile], int]:
    total_result = db.execute(select(func.count(SharedFile.id)).where(SharedFile.folder_id == folder_id))
    total = int(total_result.scalar_one() or 0)

    stmt = (
        select(SharedFile)
        .options(selectinload(SharedFile.uploader))
        .where(SharedFile.folder_id == folder_id)
        .order_by(SharedFile.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = db.execute(stmt)
    return list(result.scalars().all()), total


def get_file(db: Session, file_id: UUID) -> SharedFile:
    file_record = db.get(SharedFile, file_id)
    if not file_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return file_record


def rename_file(db: Session, file_id: UUID, filename: str, current_user_id: int, is_admin: bool) -> SharedFile:
    file_record = get_file(db, file_id)
    if not is_admin and file_record.uploader_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only rename files you uploaded")

    file_record.filename = filename
    db.commit()
    db.refresh(file_record)
    return file_record


def delete_file(db: Session, file_id: UUID, current_user_id: int, is_admin: bool) -> None:
    file_record = get_file(db, file_id)
    if not is_admin and file_record.uploader_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete files you uploaded")

    try:
        storage.delete(file_record.storage_key)
        if file_record.thumbnail_key:
            storage.delete(file_record.thumbnail_key)
    except Exception:
        logger.exception("Failed to delete file storage for %s", file_record.id)

    db.delete(file_record)
    db.commit()


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def _user_ref(user) -> UserReference | None:
    if user is None:
        return None
    return UserReference(
        id=getattr(user, "id"),
        username=getattr(user, "username", ""),
        full_name=getattr(user, "full_name", ""),
    )


def serialize_folder(folder: SharedFolder) -> FolderResponse:
    return FolderResponse(
        id=folder.id,
        parent_id=folder.parent_id,
        name=folder.name,
        created_by_id=folder.created_by_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


def serialize_file(file_record: SharedFile, download_url: str | None = None) -> FileResponse:
    return FileResponse(
        id=file_record.id,
        folder_id=file_record.folder_id,
        filename=file_record.filename,
        content_type=file_record.content_type,
        file_size=file_record.file_size,
        uploader=_user_ref(file_record.uploader),
        created_at=file_record.created_at,
        updated_at=file_record.updated_at,
        download_url=download_url,
    )


def serialize_upload(file_record: SharedFile) -> UploadResponse:
    return UploadResponse(
        id=file_record.id,
        filename=file_record.filename,
        content_type=file_record.content_type,
        file_size=file_record.file_size,
    )
