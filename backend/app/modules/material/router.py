from __future__ import annotations

import logging
from uuid import UUID

from anyio import to_thread
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse as FastAPIFileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.modules.material.schemas import (
    AddMaterialRequest,
    BreadcrumbItem,
    MaterialFileListResponse,
    MaterialFileRenameRequest,
    MaterialFileResponse,
    MaterialFileUploadResponse,
    MaterialFolderCreateRequest,
    MaterialFolderListResponse,
    MaterialFolderRenameRequest,
    MaterialFolderResponse,
    MaterialLessonListResponse,
    MaterialResponse,
    MaterialStatusResponse,
    SharedMaterialFile,
    SharedMaterialFileListResponse,
)
from app.modules.material.services import (
    _course_info_lessons,
    build_breadcrumb,
    create_file_record,
    create_folder,
    delete_file,
    delete_folder,
    duplicate_file,
    get_file,
    get_or_raise_master,
    list_files,
    list_folders,
    list_material_lessons,
    list_shared_files,
    rename_file,
    rename_folder,
    save_uploaded_file,
    serialize_file,
    serialize_folder,
    serialize_material,
    serialize_shared_file,
    serialize_upload,
    set_material_status,
    storage,
    sync_material_to_library,
    sync_delete_library_material_for_material_file,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/materials", tags=["Material"])


# ---------------------------------------------------------------------------
# Material (per course master)
# ---------------------------------------------------------------------------

@router.get("/{material_id}", response_model=SuccessResponse[MaterialResponse])
def get_material(
    material_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.MATERIAL_READ)),
):
    master = get_or_raise_master(db, material_id)
    return ok(serialize_material(db, master))


@router.post(
    "/{material_id}/complete", response_model=SuccessResponse[MaterialStatusResponse]
)
def mark_material_complete(
    material_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.MATERIAL_WRITE)),
):
    master = get_or_raise_master(db, material_id)
    set_material_status(db, master, "complete", user.id)
    return ok(
        MaterialStatusResponse(
            material_id=master.id,
            status="complete",
            course_master_completion=master.material_completion,
        )
    )


@router.post(
    "/{material_id}/incomplete", response_model=SuccessResponse[MaterialStatusResponse]
)
def unmark_material_complete(
    material_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.MATERIAL_WRITE)),
):
    master = get_or_raise_master(db, material_id)
    set_material_status(db, master, "incomplete", user.id)
    return ok(
        MaterialStatusResponse(
            material_id=master.id,
            status="incomplete",
            course_master_completion=master.material_completion,
        )
    )


# ---------------------------------------------------------------------------
# Lessons (material is organised under the course's lessons)
# ---------------------------------------------------------------------------

@router.get(
    "/{material_id}/lessons",
    response_model=SuccessResponse[MaterialLessonListResponse],
)
def get_lessons(
    material_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.MATERIAL_READ)),
):
    master = get_or_raise_master(db, material_id)
    items = list_material_lessons(db, master)
    return ok(MaterialLessonListResponse(items=items, total=len(items)))


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------

@router.get(
    "/{material_id}/folders",
    response_model=SuccessResponse[MaterialFolderListResponse],
)
def get_folders(
    material_id: int,
    parent_id: UUID | None = Query(None),
    lesson_id: int | None = Query(None),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.MATERIAL_READ)),
):
    folders = list_folders(db, material_id, parent_id, lesson_id, order)
    return ok(
        MaterialFolderListResponse(
            items=[serialize_folder(f) for f in folders], total=len(folders)
        )
    )


@router.post(
    "/{material_id}/folders",
    response_model=SuccessResponse[MaterialFolderResponse],
    status_code=201,
)
def post_folder(
    material_id: int,
    data: MaterialFolderCreateRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.MATERIAL_WRITE)),
):
    folder = create_folder(
        db, material_id, data.name, data.parent_id, data.lesson_id, user.id
    )
    return ok(serialize_folder(folder))


@router.patch(
    "/folders/{folder_id}", response_model=SuccessResponse[MaterialFolderResponse]
)
def patch_folder(
    folder_id: UUID,
    data: MaterialFolderRenameRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.MATERIAL_WRITE)),
):
    folder = rename_folder(db, folder_id, data.name)
    return ok(serialize_folder(folder))


@router.delete("/folders/{folder_id}", status_code=204)
def remove_folder(
    folder_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.MATERIAL_DELETE)),
):
    delete_folder(db, folder_id)


@router.get(
    "/folders/{folder_id}/breadcrumb",
    response_model=SuccessResponse[list[BreadcrumbItem]],
)
def get_breadcrumb(
    folder_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.MATERIAL_READ)),
):
    return ok(build_breadcrumb(db, folder_id))


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

@router.get(
    "/{material_id}/files",
    response_model=SuccessResponse[MaterialFileListResponse],
)
def get_files(
    material_id: int,
    folder_id: UUID | None = Query(None),
    lesson_id: int | None = Query(None),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.MATERIAL_READ)),
):
    files_with_lib, total = list_files(db, material_id, folder_id, limit, offset, lesson_id)
    items = [
        serialize_file(f, library_material_id=lib_id)
        for f, lib_id in files_with_lib
    ]
    return ok(
        MaterialFileListResponse(
            items=items, total=total, limit=limit, offset=offset
        )
    )


@router.post(
    "/{material_id}/files",
    response_model=SuccessResponse[MaterialFileUploadResponse],
    status_code=201,
)
async def upload_file(
    material_id: int,
    file: UploadFile = File(...),
    total_pages: int = Form(0),
    folder_id: UUID | None = Query(None),
    lesson_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.MATERIAL_WRITE)),
):
    file_bytes = await file.read()
    storage_key, thumbnail_key = await to_thread.run_sync(
        save_uploaded_file,
        file_bytes,
        file.filename or "unnamed",
        file.content_type or "application/octet-stream",
    )

    file_record = create_file_record(
        db=db,
        material_id=material_id,
        folder_id=folder_id,
        lesson_id=lesson_id,
        uploader_id=user.id,
        filename=file.filename or "unnamed",
        content_type=file.content_type or "application/octet-stream",
        file_size=len(file_bytes),
        storage_key=storage_key,
        thumbnail_key=thumbnail_key,
        total_pages=total_pages,
    )

    library_material_id: int | None = None
    try:
        lib_id = sync_material_to_library(db, file_record, total_pages=total_pages)
        library_material_id = lib_id
        try:
            from app.modules.library.services import get_or_create_summary_by_type
            from app.modules.library.scheduler import trigger_summarize
            if lib_id is not None:
                get_or_create_summary_by_type(db, "course_master", lib_id)
                trigger_summarize(lib_id)
        except Exception:
            logger.exception(
                "Failed to register MaterialFile for summarization %s", file_record.id)
    except Exception:
        logger.exception(
            "Failed to sync MaterialFile upload to Library %s", file_record.id)

    return ok(serialize_upload(file_record, library_material_id=library_material_id, total_pages=total_pages))


@router.get("/files/{file_id}/download")
def download_file(
    file_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.MATERIAL_READ)),
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


@router.patch(
    "/files/{file_id}", response_model=SuccessResponse[MaterialFileResponse]
)
def patch_file(
    file_id: UUID,
    data: MaterialFileRenameRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.MATERIAL_WRITE)),
):
    file_record = rename_file(db, file_id, data.filename)
    return ok(serialize_file(file_record))


@router.delete("/files/{file_id}", status_code=204)
def remove_file(
    file_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.MATERIAL_DELETE)),
):
    delete_file(db, file_id)
    


# ---------------------------------------------------------------------------
# Shared / existing materials (duplicate from other lessons)
# ---------------------------------------------------------------------------

@router.get(
    "/{material_id}/shared-files",
    response_model=SuccessResponse[SharedMaterialFileListResponse],
)
def get_shared_files(
    material_id: int,
    exclude_lesson_id: int | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.MATERIAL_READ)),
):
    master = get_or_raise_master(db, material_id)
    # Build lesson-lookup once
    lessons = _course_info_lessons(master)
    lesson_map: dict[int, tuple[str | None, str | None]] = {
        l.id: (l.lesson_number, l.lesson_title) for l in lessons
    }

    files, total = list_shared_files(db, material_id, exclude_lesson_id, limit, offset)
    items = []
    for f, lib_id in files:
        item = serialize_shared_file(f, library_material_id=lib_id, total_pages=f.total_pages)
        if f.lesson_id is not None:
            number, title = lesson_map.get(f.lesson_id, (None, None))
            item["source_lesson_number"] = number
            item["source_lesson_title"] = title
        items.append(item)
    return ok(SharedMaterialFileListResponse(items=items, total=total))


@router.post(
    "/{material_id}/add-material",
    response_model=SuccessResponse[MaterialFileResponse],
    status_code=201,
)
def add_existing_material(
    material_id: int,
    data: AddMaterialRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.MATERIAL_WRITE)),
):
    file_record = duplicate_file(
        db, material_id, data.file_id, data.target_lesson_id, user.id
    )
    return ok(serialize_file(file_record, total_pages=file_record.total_pages))
