from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse as FastAPIFileResponse
from sqlalchemy.orm import Session
from anyio import to_thread

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.modules.file_sharing.models import SharedFile
from app.modules.file_sharing.schemas import (
    BreadcrumbItem,
    FileListResponse,
    FileRenameRequest,
    FileResponse,
    FolderCreateRequest,
    FolderListResponse,
    FolderRenameRequest,
    FolderResponse,
    UploadResponse,
)
from app.modules.file_sharing.services import (
    build_breadcrumb,
    create_file_record,
    create_folder,
    delete_file,
    delete_folder,
    get_file,
    list_files,
    list_folders,
    rename_file,
    rename_folder,
    save_uploaded_file,
    serialize_file,
    serialize_folder,
    serialize_upload,
    storage,
)
from app.modules.file_sharing.storage import get_storage_backend

router = APIRouter(prefix="/file-sharing", tags=["File Sharing"])


def _is_admin(user) -> bool:
    return "admin" in [r.name.lower() if hasattr(r, "name") else str(r).lower() for r in getattr(user, "roles", [])]


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------

@router.get("/folders", response_model=SuccessResponse[FolderListResponse])
def get_folders(
    parent_id: UUID | None = Query(None),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FILE_READ)),
):
    folders = list_folders(db, parent_id, order)
    return ok(FolderListResponse(items=[serialize_folder(f) for f in folders], total=len(folders)))


@router.post("/folders", response_model=SuccessResponse[FolderResponse], status_code=201)
def post_folder(
    data: FolderCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.FILE_WRITE)),
):
    folder = create_folder(db, data.name, data.parent_id, current_user.id)
    return ok(serialize_folder(folder))


@router.delete("/folders/{folder_id}", status_code=204)
def remove_folder(
    folder_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.FILE_DELETE)),
):
    delete_folder(db, folder_id, current_user.id, _is_admin(current_user))


@router.patch("/folders/{folder_id}", response_model=SuccessResponse[FolderResponse])
def patch_folder(
    folder_id: UUID,
    data: FolderRenameRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.FILE_WRITE)),
):
    folder = rename_folder(db, folder_id, data.name, current_user.id, _is_admin(current_user))
    return ok(serialize_folder(folder))


@router.get("/folders/{folder_id}/breadcrumb", response_model=SuccessResponse[list[BreadcrumbItem]])
def get_breadcrumb(
    folder_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FILE_READ)),
):
    breadcrumb = build_breadcrumb(db, folder_id)
    return ok(breadcrumb)


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

@router.get("/files", response_model=SuccessResponse[FileListResponse])
def get_files(
    folder_id: UUID | None = Query(None),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FILE_READ)),
):
    files, total = list_files(db, folder_id, limit, offset)
    items = [serialize_file(f) for f in files]
    return ok(FileListResponse(items=items, total=total, limit=limit, offset=offset))


@router.post("/files", response_model=SuccessResponse[UploadResponse], status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    folder_id: UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.FILE_WRITE)),
):
    file_bytes = await file.read()
    storage_key, thumbnail_key = await to_thread.run_sync(
        save_uploaded_file, file_bytes, file.filename or "unnamed", file.content_type or "application/octet-stream"
    )

    file_record = create_file_record(
        db=db,
        folder_id=folder_id,
        uploader_id=current_user.id,
        filename=file.filename or "unnamed",
        content_type=file.content_type or "application/octet-stream",
        file_size=len(file_bytes),
        storage_key=storage_key,
        thumbnail_key=thumbnail_key,
    )
    return ok(serialize_upload(file_record))


@router.get("/files/{file_id}/download")
def download_file(
    file_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FILE_READ)),
):
    file_record = get_file(db, file_id)
    abs_path = storage.get_absolute_path(file_record.storage_key)
    if not abs_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")
    return FastAPIFileResponse(
        path=str(abs_path),
        filename=file_record.filename,
        media_type=file_record.content_type,
    )


@router.delete("/files/{file_id}", status_code=204)
def remove_file(
    file_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.FILE_DELETE)),
):
    delete_file(db, file_id, current_user.id, _is_admin(current_user))


@router.patch("/files/{file_id}", response_model=SuccessResponse[FileResponse])
def patch_file(
    file_id: UUID,
    data: FileRenameRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.FILE_WRITE)),
):
    file_record = rename_file(db, file_id, data.filename, current_user.id, _is_admin(current_user))
    return ok(serialize_file(file_record))
