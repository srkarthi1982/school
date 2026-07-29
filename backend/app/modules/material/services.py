from __future__ import annotations

import logging
import json
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, event, func, select
from sqlalchemy.orm import Session, selectinload, object_session

from app.core.config import settings
from app.core.file_validation import validate_uploaded_file as _validate_uploaded_file
from app.modules.course_master.models import CourseMaster
from app.modules.file_sharing.storage import FilesystemStorage
from app.modules.library.models import LibraryMaterial
from app.modules.material.models import MaterialFile, MaterialFolder
from app.modules.material.schemas import (
    BreadcrumbItem,
    MaterialFileResponse,
    MaterialFileUploadResponse,
    MaterialFolderResponse,
    MaterialLessonResponse,
    MaterialResponse,
    UserReference,
)

if TYPE_CHECKING:
    from app.modules.course_info.models import CourseInfoLessonCreationLesson

logger = logging.getLogger(__name__)

storage = FilesystemStorage(settings.MATERIAL_UPLOAD_DIR)


def _safe_filename(name: str) -> str:
    return Path(name).name


def validate_material_file(content_type: str, file_bytes: bytes) -> None:
    _validate_uploaded_file(
        content_type,
        file_bytes,
        allowed_types=settings.MATERIAL_ALLOWED_TYPES,
        max_size_bytes=settings.MATERIAL_MAX_FILE_SIZE_BYTES,
    )


def get_or_raise_master(db: Session, course_master_id: int) -> CourseMaster:
    master = db.get(CourseMaster, course_master_id)
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    return master


def material_status_of(master: CourseMaster) -> str:
    return "complete" if master.material_completion >= 100 else "incomplete"


def set_material_status(
    db: Session, master: CourseMaster, new_status: str, user_id: int
) -> CourseMaster:
    if new_status not in ("incomplete", "complete"):
        raise HTTPException(
            status_code=400, detail="status must be 'incomplete' or 'complete'")
    if (
        new_status != "complete"
        and master.material_completion >= 100
        and master.status == "approved"
    ):
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    master.material_completion = 100 if new_status == "complete" else 0
    master.updated_by_id = user_id
    db.commit()
    db.refresh(master)
    return master


def _course_info_lessons(master: CourseMaster) -> list[CourseInfoLessonCreationLesson]:
    lesson_creation = master.lesson_creation
    if lesson_creation is None:
        return []
    return list(lesson_creation.lessons)


def _validate_lesson_for_master(
    db: Session, master: CourseMaster, lesson_id: int | None
) -> None:
    if lesson_id is None:
        return
    valid_ids = {lesson.id for lesson in _course_info_lessons(master)}
    if lesson_id not in valid_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson not found for this course",
        )


def list_material_lessons(db: Session, master: CourseMaster) -> list[MaterialLessonResponse]:
    lessons = _course_info_lessons(master)
    if not lessons:
        return []
    counts = dict(
        db.execute(
            select(MaterialFile.lesson_id, func.count(MaterialFile.id))
            .where(
                MaterialFile.course_master_id == master.id,
                MaterialFile.lesson_id.is_not(None),
            )
            .group_by(MaterialFile.lesson_id)
        ).all()
    )
    return [
        MaterialLessonResponse(
            id=lesson.id,
            lesson_number=lesson.lesson_number,
            lesson_title=lesson.lesson_title,
            order_index=lesson.order_index,
            file_count=int(counts.get(lesson.id, 0)),
        )
        for lesson in lessons
    ]


def create_folder(
    db: Session,
    material_id: int,
    name: str,
    parent_id: UUID | None,
    lesson_id: int | None,
    created_by_id: int,
) -> MaterialFolder:
    master = get_or_raise_master(db, material_id)
    if parent_id:
        parent = db.get(MaterialFolder, parent_id)
        if not parent or parent.course_master_id != master.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found")
        lesson_id = parent.lesson_id
    else:
        _validate_lesson_for_master(db, master, lesson_id)

    stmt = select(MaterialFolder).where(
        MaterialFolder.course_master_id == material_id,
        MaterialFolder.parent_id == parent_id,
        MaterialFolder.lesson_id == lesson_id,
        MaterialFolder.name == name,
    )
    if db.execute(stmt).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A folder with this name already exists here",
        )

    folder = MaterialFolder(
        course_master_id=material_id,
        parent_id=parent_id,
        lesson_id=lesson_id,
        name=name,
        created_by_id=created_by_id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def list_folders(
    db: Session,
    material_id: int,
    parent_id: UUID | None,
    lesson_id: int | None = None,
    order: str = "asc",
) -> list[MaterialFolder]:
    stmt = select(MaterialFolder).where(
        MaterialFolder.course_master_id == material_id,
        MaterialFolder.parent_id == parent_id,
    )
    if lesson_id is not None:
        stmt = stmt.where(MaterialFolder.lesson_id == lesson_id)
    if order == "desc":
        stmt = stmt.order_by(MaterialFolder.name.desc())
    else:
        stmt = stmt.order_by(MaterialFolder.name.asc())
    return list(db.execute(stmt).scalars().all())


def get_folder(db: Session, folder_id: UUID) -> MaterialFolder:
    folder = db.get(MaterialFolder, folder_id)
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder


def rename_folder(db: Session, folder_id: UUID, name: str) -> MaterialFolder:
    folder = get_folder(db, folder_id)
    stmt = select(MaterialFolder).where(
        MaterialFolder.course_master_id == folder.course_master_id,
        MaterialFolder.parent_id == folder.parent_id,
        MaterialFolder.lesson_id == folder.lesson_id,
        MaterialFolder.name == name,
        MaterialFolder.id != folder_id,
    )
    if db.execute(stmt).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A folder with this name already exists here",
        )
    folder.name = name
    db.commit()
    db.refresh(folder)
    return folder


def _delete_folder_recursive(db: Session, folder: MaterialFolder) -> None:
    for file in list(folder.files):
        _delete_file_from_disk(file)
        db.delete(file)
    for child in list(folder.children):
        _delete_folder_recursive(db, child)
    db.delete(folder)


def delete_folder(db: Session, folder_id: UUID) -> None:
    folder = get_folder(db, folder_id)
    _delete_folder_recursive(db, folder)
    db.commit()


def build_breadcrumb(db: Session, folder_id: UUID) -> list[BreadcrumbItem]:
    breadcrumb: list[BreadcrumbItem] = []
    current_id: UUID | None = folder_id
    visited: set[UUID] = set()
    while current_id and current_id not in visited:
        visited.add(current_id)
        folder = db.get(MaterialFolder, current_id)
        if not folder:
            break
        breadcrumb.append(BreadcrumbItem(id=folder.id, name=folder.name))
        current_id = folder.parent_id
    breadcrumb.reverse()
    return breadcrumb


def save_uploaded_file(
    file_bytes: bytes, filename: str, content_type: str
) -> tuple[str, str | None]:
    validate_material_file(content_type, file_bytes)
    return storage.save(file_bytes, filename, content_type)


def create_file_record(
    db: Session,
    material_id: int,
    folder_id: UUID | None,
    lesson_id: int | None,
    uploader_id: int,
    filename: str,
    content_type: str,
    file_size: int,
    storage_key: str,
    thumbnail_key: str | None,
    total_pages: int = 0,
) -> MaterialFile:
    master = get_or_raise_master(db, material_id)
    if folder_id:
        folder = db.get(MaterialFolder, folder_id)
        if not folder or folder.course_master_id != master.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
        lesson_id = folder.lesson_id
    else:
        _validate_lesson_for_master(db, master, lesson_id)

    file_record = MaterialFile(
        course_master_id=material_id,
        folder_id=folder_id,
        lesson_id=lesson_id,
        uploader_id=uploader_id,
        filename=filename,
        content_type=content_type,
        file_size=file_size,
        storage_key=storage_key,
        thumbnail_key=thumbnail_key,
        total_pages=total_pages,
    )
    db.add(file_record)
    db.commit()
    db.refresh(file_record)
    return file_record


def _delete_file_from_disk(file_record: MaterialFile) -> None:
    try:
        storage.delete(file_record.storage_key)
        if file_record.thumbnail_key:
            storage.delete(file_record.thumbnail_key)
    except Exception:
        logger.exception(
            "Failed to delete material file storage for %s", file_record.id)


def get_file(db: Session, file_id: UUID) -> MaterialFile:
    file_record = db.get(MaterialFile, file_id)
    if not file_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return file_record


def rename_file(db: Session, file_id: UUID, filename: str) -> MaterialFile:
    file_record = get_file(db, file_id)
    file_record.filename = filename
    db.commit()
    db.refresh(file_record)
    return file_record


def delete_file(db: Session, file_id: UUID) -> None:
    file_record = get_file(db, file_id)
    _delete_file_from_disk(file_record)
    db.delete(file_record)
    sync_delete_library_material_for_material_file(db, file_record)
    db.commit()


def list_files(
    db: Session,
    material_id: int,
    folder_id: UUID | None,
    limit: int,
    offset: int,
    lesson_id: int | None = None,
) -> tuple[list[tuple[MaterialFile, int | None]], int]:
    from app.modules.library.models import LibraryMaterial

    filters = [
        MaterialFile.course_master_id == material_id,
        MaterialFile.folder_id == folder_id,
    ]
    if lesson_id is not None:
        filters.append(MaterialFile.lesson_id == lesson_id)

    total_stmt = select(func.count(MaterialFile.id)).where(*filters)
    total = int(db.execute(total_stmt).scalar_one() or 0)

    stmt = (
        select(MaterialFile)
        .outerjoin(
            LibraryMaterial,
            and_(
                LibraryMaterial.file_url == MaterialFile.storage_key,
                LibraryMaterial.material_type == "course_master",
            ),
        )
        .add_columns(LibraryMaterial.id)
        .options(selectinload(MaterialFile.uploader))
        .where(*filters)
        .order_by(MaterialFile.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    return [(row[0], row[1]) for row in rows], total


def purge_material(db: Session, course_master_id: int):
    rows = db.execute(
        select(MaterialFile.storage_key, MaterialFile.thumbnail_key).where(
            MaterialFile.course_master_id == course_master_id
        )
    ).all()

    for storage_key, thumbnail_key in rows:
        try:
            storage.delete(storage_key)
            if thumbnail_key:
                storage.delete(thumbnail_key)
        except Exception:
            logger.exception(
                "Failed to purge material file %s on master delete", storage_key)

    keys = [sk for sk, _ in rows]
    if not keys:
        return

    db.execute(
        delete(LibraryMaterial).where(
            LibraryMaterial.file_url.in_(keys),
            LibraryMaterial.material_type == "course_master",
        )
    )


# @event.listens_for(CourseMaster, "before_delete")
# def _purge_material_disk_files(mapper, connection, target: CourseMaster) -> None:
#     session = object_session(target)
#     rows = session.execute(
#         select(MaterialFile.storage_key, MaterialFile.thumbnail_key).where(
#             MaterialFile.course_master_id == target.id
#         )
#     ).all()

#     # rows = connection.execute(
#     #     select(MaterialFile.storage_key, MaterialFile.thumbnail_key).where(
#     #         MaterialFile.course_master_id == target.id
#     #     )
#     # ).all()
#     for storage_key, thumbnail_key in rows:
#         try:
#             storage.delete(storage_key)
#             if thumbnail_key:
#                 storage.delete(thumbnail_key)
#         except Exception:
#             logger.exception(
#                 "Failed to purge material file %s on master delete", storage_key)


# @event.listens_for(CourseMaster, "before_delete")
# def _purge_master_library_materials(mapper, connection, target: CourseMaster) -> None:
#     """Delete mirrored LibraryMaterial (and cascade MaterialSummary + UserProgress)
#     for all MaterialFile rows belonging to the course master being deleted."""
#     session = object_session(target)
#     keys = session.execute(
#         select(MaterialFile.storage_key)
#         .where(MaterialFile.course_master_id == target.id)
#     ).scalars().all()

#     # keys = connection.execute(
#     #     select(MaterialFile.storage_key)
#     #     .where(MaterialFile.course_master_id == target.id)
#     # ).scalars().all()

#     if not keys:
#         return

#     connection.execute(
#         delete(LibraryMaterial).where(
#             LibraryMaterial.file_url.in_(keys),
#             LibraryMaterial.material_type == "course",
#         )
#     )


def _user_ref(user) -> UserReference | None:
    if user is None:
        return None
    return UserReference(
        id=getattr(user, "id"),
        username=getattr(user, "username", ""),
        full_name=getattr(user, "full_name", ""),
    )


def serialize_material(db: Session, master: CourseMaster) -> MaterialResponse:
    root_folder_count = int(
        db.execute(
            select(func.count(MaterialFolder.id)).where(
                MaterialFolder.course_master_id == master.id,
                MaterialFolder.parent_id.is_(None),
            )
        ).scalar_one()
        or 0
    )
    root_file_count = int(
        db.execute(
            select(func.count(MaterialFile.id)).where(
                MaterialFile.course_master_id == master.id,
                MaterialFile.folder_id.is_(None),
            )
        ).scalar_one()
        or 0
    )
    return MaterialResponse(
        id=master.id,
        course_master_id=master.id,
        title=master.title,
        status=material_status_of(master),
        course_master_status=master.status,
        course_master_completion=master.material_completion,
        root_folder_count=root_folder_count,
        root_file_count=root_file_count,
    )


def serialize_folder(folder: MaterialFolder) -> MaterialFolderResponse:
    return MaterialFolderResponse(
        id=folder.id,
        material_id=folder.course_master_id,
        parent_id=folder.parent_id,
        lesson_id=folder.lesson_id,
        name=folder.name,
        created_by_id=folder.created_by_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


def serialize_file(
    file_record: MaterialFile,
    download_url: str | None = None,
    library_material_id: int | None = None,
    total_pages: int = 0,
) -> MaterialFileResponse:
    return MaterialFileResponse(
        id=file_record.id,
        material_id=file_record.course_master_id,
        folder_id=file_record.folder_id,
        lesson_id=file_record.lesson_id,
        filename=file_record.filename,
        content_type=file_record.content_type,
        file_size=file_record.file_size,
        uploader=_user_ref(file_record.uploader),
        created_at=file_record.created_at,
        updated_at=file_record.updated_at,
        download_url=download_url,
        library_material_id=library_material_id,
        total_pages=total_pages,
    )


def serialize_upload(
    file_record: MaterialFile,
    library_material_id: int | None = None,
    total_pages: int = 0,
) -> MaterialFileUploadResponse:
    return MaterialFileUploadResponse(
        id=file_record.id,
        filename=file_record.filename,
        content_type=file_record.content_type,
        file_size=file_record.file_size,
        library_material_id=library_material_id,
        total_pages=total_pages,
    )


def list_shared_files(
    db: Session,
    material_id: int,
    exclude_lesson_id: int | None = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[tuple[MaterialFile, int | None]], int]:
    """List files from *other* lessons (files that can be duplicated)."""
    from app.modules.library.models import LibraryMaterial

    filters = [
        MaterialFile.course_master_id == material_id,
        MaterialFile.lesson_id.isnot(None),
    ]
    if exclude_lesson_id is not None:
        filters.append(MaterialFile.lesson_id != exclude_lesson_id)

    total_stmt = select(func.count(MaterialFile.id)).where(*filters)
    total = int(db.execute(total_stmt).scalar_one() or 0)

    stmt = (
        select(MaterialFile)
        .outerjoin(
            LibraryMaterial,
            and_(
                LibraryMaterial.file_url == MaterialFile.storage_key,
                LibraryMaterial.material_type == "course_master",
            ),
        )
        .add_columns(LibraryMaterial.id)
        .options(selectinload(MaterialFile.uploader))
        .where(*filters)
        .order_by(MaterialFile.filename.asc())
        .offset(offset)
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    return [(row[0], row[1]) for row in rows], total


def duplicate_file(
    db: Session,
    material_id: int,
    file_id: UUID,
    target_lesson_id: int | None,
    user_id: int,
) -> MaterialFile:
    """Create a new material-file record sharing storage key with another lesson."""
    get_or_raise_master(db, material_id)
    source = get_file(db, file_id)

    if source.course_master_id != material_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source file does not belong to this material",
        )

    if source.lesson_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source file is not attached to a lesson",
        )

    target = target_lesson_id if target_lesson_id is not None else source.lesson_id

    stmt = select(MaterialFile).where(
        MaterialFile.course_master_id == material_id,
        MaterialFile.filename == source.filename,
        MaterialFile.lesson_id == target,
        MaterialFile.folder_id == source.folder_id,
        MaterialFile.id != file_id,
    )
    if db.execute(stmt).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'"{source.filename}" already exists in the target lesson',
        )

    existing_lib = db.query(LibraryMaterial).filter(
        LibraryMaterial.file_url == source.storage_key,
        LibraryMaterial.material_type == "course_master",
    ).first()

    new_record = MaterialFile(
        course_master_id=material_id,
        folder_id=None,
        lesson_id=target,
        uploader_id=user_id,
        filename=source.filename,
        content_type=source.content_type,
        file_size=source.file_size,
        storage_key=source.storage_key,
        thumbnail_key=source.thumbnail_key,
        total_pages=source.total_pages,
    )
    db.add(new_record)
    db.commit()
    db.refresh(new_record)

    if not existing_lib:
        try:
            lib_id = sync_material_to_library(
                db, new_record, total_pages=new_record.total_pages)
            if lib_id is not None:
                from app.modules.library.services import get_or_create_summary_by_type
                from app.modules.library.scheduler import trigger_summarize
                get_or_create_summary_by_type(db, "course_master", lib_id)
                trigger_summarize(lib_id)
        except Exception:
            logger.exception(
                "Failed to sync duplicate file to Library %s", new_record.id)

    return new_record


def serialize_shared_file(
    file_record: MaterialFile,
    download_url: str | None = None,
    library_material_id: int | None = None,
    total_pages: int = 0,
) -> dict:
    return {
        "id": file_record.id,
        "material_id": file_record.course_master_id,
        "folder_id": file_record.folder_id,
        "lesson_id": file_record.lesson_id,
        "filename": file_record.filename,
        "content_type": file_record.content_type,
        "file_size": file_record.file_size,
        "uploader": _user_ref(file_record.uploader),
        "created_at": file_record.created_at,
        "updated_at": file_record.updated_at,
        "download_url": download_url,
        "source_lesson_id": file_record.lesson_id,
        "source_lesson_number": None,
        "source_lesson_title": None,
        "library_material_id": library_material_id,
        "total_pages": total_pages,
    }


def sync_material_to_library(
    db: Session, mf_file: MaterialFile, total_pages: int = 0
) -> int | None:
    """Create a mirroring LibraryMaterial for a MaterialFile upload."""
    existing = db.query(LibraryMaterial).filter(
        LibraryMaterial.file_url == mf_file.storage_key,
        LibraryMaterial.material_type == "course_master",
    ).first()
    if existing is not None:
        return existing.id

    try:
        master = db.get(CourseMaster, mf_file.course_master_id)
        if not master:
            return None
        metadata_json = json.dumps({"course": master.title})
    except Exception:
        metadata_json = json.dumps({"course": ""})

    lib_material = LibraryMaterial(
        file_id=str(mf_file.id),
        file_url=mf_file.storage_key,
        file_name=mf_file.filename,
        content_type=mf_file.content_type,
        file_size=mf_file.file_size,
        title=mf_file.filename,
        description="",
        category="Course",
        material_type="course_master",
        version="1",
        upload_date=datetime.utcnow(),
        folder="",
        uploaded_by=mf_file.uploader.full_name if mf_file.uploader else None,
        approved_status="pending",
        metadata_json=metadata_json,
        totalPages=total_pages,
    )
    db.add(lib_material)
    db.commit()
    db.refresh(lib_material)
    return lib_material.id


def sync_delete_library_material_for_material_file(
    db: Session, mf_file: MaterialFile
) -> None:
    """Delete the mirrored LibraryMaterial (and summary/progress) for a MaterialFile."""
    from app.modules.library.models import LibraryMaterialUserProgress, MaterialSummary

    lib_mat = db.query(LibraryMaterial).filter(
        LibraryMaterial.file_url == mf_file.storage_key,
        LibraryMaterial.material_type == "course_master",
    ).first()
    if not lib_mat:
        return

    try:
        db.query(MaterialSummary).filter(
            MaterialSummary.material_type == "course_master",
            MaterialSummary.id == lib_mat.id,
        ).delete(synchronize_session="fetch")
        db.query(LibraryMaterialUserProgress).filter(
            LibraryMaterialUserProgress.material_id == lib_mat.id,
        ).delete(synchronize_session="fetch")
        db.query(LibraryMaterial).filter(
            LibraryMaterial.id == lib_mat.id,
        ).delete(synchronize_session="fetch")
    except Exception:
        logger.exception(
            "Failed to sync-delete LibraryMaterial for MaterialFile %s",
            str(mf_file.id),
        )
