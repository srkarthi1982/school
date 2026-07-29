from __future__ import annotations

import logging
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, event, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.file_validation import validate_uploaded_file as _validate_uploaded_file
from app.modules.course.models import CourseInstance
from app.modules.course_selection_info import services as csinfo
from app.modules.file_sharing.storage import FilesystemStorage
from app.modules.material.models import MaterialFile, MaterialFolder
from app.modules.course_selection_material.models import (
    CourseSelectionMaterialFile,
    CourseSelectionMaterialFolder,
)
from app.modules.library.models import LibraryMaterial
from app.modules.course_selection_material.schemas import (
    BreadcrumbItem,
    MaterialFileResponse,
    MaterialFileUploadResponse,
    MaterialFolderResponse,
    MaterialLessonResponse,
    MaterialResponse,
    UserReference,
)

if TYPE_CHECKING:
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreationLesson,
    )

logger = logging.getLogger(__name__)

# Instance material reuses the *same* physical storage location as master
# material (MATERIAL_UPLOAD_DIR). Seeding copies the bytes to fresh storage
# keys so an instance's files are fully independent of the master's.
storage = FilesystemStorage(settings.MATERIAL_UPLOAD_DIR)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _safe_filename(name: str) -> str:
    return Path(name).name


def validate_material_file(content_type: str, file_bytes: bytes) -> None:
    _validate_uploaded_file(
        content_type,
        file_bytes,
        allowed_types=settings.MATERIAL_ALLOWED_TYPES,
        max_size_bytes=settings.MATERIAL_MAX_FILE_SIZE_BYTES,
    )


# ---------------------------------------------------------------------------
# Material (per course instance)
#
# A course instance *is* its material: ``course_instances.title`` is the title
# and the binary completion state lives in ``course_instances.material_completion``
# (100/0). Folders/files hang off ``course_instance_id``. Throughout this module
# the ``material_id`` parameter name is preserved for symmetry with the master
# material module, but its value is the course instance id.
# ---------------------------------------------------------------------------

def get_or_raise_course(db: Session, course_instance_id: int) -> CourseInstance:
    course = db.get(CourseInstance, course_instance_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    return course


def material_status_of(course: CourseInstance) -> str:
    """Derive the binary material status from the instance's completion column."""
    return "complete" if course.material_completion >= 100 else "incomplete"


def set_material_status(
    db: Session, course: CourseInstance, new_status: str, user_id: int
) -> CourseInstance:
    if new_status not in ("incomplete", "complete"):
        raise HTTPException(
            status_code=400, detail="status must be 'incomplete' or 'complete'")
    if (
        new_status != "complete"
        and course.material_completion >= 100
        and course.status == "approved"
    ):
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    course.material_completion = 100 if new_status == "complete" else 0
    course.updated_by_id = user_id
    db.commit()
    db.refresh(course)
    return course


# ---------------------------------------------------------------------------
# Lazy seed from master
# ---------------------------------------------------------------------------

def seed_from_master(db: Session, course: CourseInstance) -> None:
    """Copy the master's material into this instance the first time it's opened.

    Idempotent via ``course.material_seeded``. Folders are cloned with a two-pass
    parent rewiring and files have their physical bytes duplicated to fresh
    storage keys so the instance is fully independent of the master. Lesson links
    are re-pointed at this instance's *own* cloned lessons (see
    ``csinfo.master_to_instance_lesson_ids``) so the material attaches to the
    instance's Course Information rather than the master's.
    """
    # Prevent seeding more than once.
    if course.material_seeded:
        return

    # Course Information (incl. the lessons we attach to) must exist on the
    # instance before its master lesson links can be re-pointed.
    csinfo.seed_course_info_from_master(db, course)
    lesson_map = csinfo.master_to_instance_lesson_ids(course)

    def _instance_lesson(master_lesson_id):
        return None if master_lesson_id is None else lesson_map.get(master_lesson_id)

    master_id = course.master_id

    folders = (
        db.query(MaterialFolder)
        .filter(MaterialFolder.course_master_id == master_id)
        .all()
    )
    folder_map: dict = {}
    for folder in folders:
        clone = CourseSelectionMaterialFolder(
            course_instance_id=course.id,
            name=folder.name,
            lesson_id=_instance_lesson(folder.lesson_id),
            created_by_id=folder.created_by_id,
        )
        folder_map[folder.id] = clone
        db.add(clone)
    # Second pass: rewire parent links now that every clone exists.
    for folder in folders:
        if folder.parent_id:
            folder_map[folder.id].parent = folder_map[folder.parent_id]

    files = (
        db.query(MaterialFile)
        .filter(MaterialFile.course_master_id == master_id)
        .all()
    )
    _cloned_map: dict = {}
    for file in files:
        storage_key, thumbnail_key = file.storage_key, file.thumbnail_key
        try:
            blob = storage.read(file.storage_key)
            storage_key, thumbnail_key = storage.save(
                blob, file.filename, file.content_type
            )
        except Exception:
            # If the source blob is missing/unreadable, fall back to sharing the
            # original keys rather than failing the whole seed.
            logger.exception(
                "Failed to copy material blob %s during instance material seed",
                file.storage_key,
            )
        clone = CourseSelectionMaterialFile(
            course_instance_id=course.id,
            folder_id=None,
            lesson_id=_instance_lesson(file.lesson_id),
            uploader_id=file.uploader_id,
            filename=file.filename,
            content_type=file.content_type,
            file_size=file.file_size,
            storage_key=storage_key,
            thumbnail_key=thumbnail_key,
            total_pages=file.total_pages,
        )
        if file.folder_id:
            clone.folder = folder_map[file.folder_id]
        _cloned_map[file.id] = clone
        db.add(clone)

    # Sync LibraryMaterial from master to cloned instance files
    for master_file_id, cloned_file in _cloned_map.items():
        master_file = db.get(MaterialFile, master_file_id)
        if not master_file:
            continue
        # Check if master file has a LibraryMaterial entry
        master_lib = db.query(LibraryMaterial).filter(
            LibraryMaterial.file_url == master_file.storage_key,
            LibraryMaterial.material_type == "course_master",
        ).first()
        if master_lib:
            # Check if clone already has a LibraryMaterial entry (same storage_key from same upload)
            existing_clone_lib = db.query(LibraryMaterial).filter(
                LibraryMaterial.file_url == cloned_file.storage_key,
                LibraryMaterial.material_type == "course",
            ).first()
            if existing_clone_lib:
                continue

            # Clone the LibraryMaterial entry
            from datetime import datetime
            new_lib = LibraryMaterial(
                file_id=str(cloned_file.id),
                file_url=cloned_file.storage_key,
                file_name=cloned_file.filename,
                content_type=cloned_file.content_type,
                file_size=cloned_file.file_size,
                title=cloned_file.filename,
                description=master_lib.description,
                category=master_lib.category,
                material_type="course",
                version=master_lib.version,
                upload_date=datetime.utcnow(),
                folder=cloned_file.storage_key,
                uploaded_by=cloned_file.uploader.full_name if cloned_file.uploader else None,
                approved_status=master_lib.approved_status,
                metadata_json=master_lib.metadata_json,
                totalPages=cloned_file.total_pages,
            )
            db.add(new_lib)

            # If master has a complete summary, copy it
            if master_lib.summary and master_lib.summary.summarize_ts is not None:
                from app.modules.library.models import MaterialSummary
                master_summary = master_lib.summary
                if master_summary and master_summary.summary:
                    new_summary = MaterialSummary(
                        # id=new_lib.id,
                        material_type="course",
                        summary=master_summary.summary,
                        narrative_text=master_summary.narrative_text,
                        narrative_voice=master_summary.narrative_voice,
                        mindmap=master_summary.mindmap,
                        summarize_ts=master_summary.summarize_ts,
                        error_message=master_summary.error_message,
                    )
                    new_lib.summary = new_summary

            # If master summary exists but is incomplete, trigger normal summarization
            elif not master_lib.summary:
                try:
                    from app.modules.library.services import get_or_create_summary_by_type
                    from app.modules.library.scheduler import trigger_summarize
                    get_or_create_summary_by_type(db, "course", new_lib.id)
                    trigger_summarize(new_lib.id)
                except Exception:
                    logger.exception("Failed to trigger summarization for seeded file %s", cloned_file.id)

    course.material_seeded = True
    db.commit()


# ---------------------------------------------------------------------------
# Modification tracking (instance content vs the master it was seeded from)
#
# A live comparison: build a canonical, per-lesson signature of the instance's
# material and of the master's material, then report the lesson buckets that
# differ (``None`` = the whole-course scope). Renames, additions, deletions and
# moves all change the signature. Storage keys are intentionally excluded — the
# seed copies bytes to fresh keys, so only logical content is compared.
# ---------------------------------------------------------------------------

def _material_signature(
    db: Session, folder_model, file_model, owner_field: str, owner_id: int
) -> dict[int | None, set]:
    """Per-lesson set of canonical (folder/file) entries for one material owner."""
    folders = list(
        db.execute(
            select(folder_model).where(
                getattr(folder_model, owner_field) == owner_id)
        ).unique().scalars().all()
    )
    by_id = {f.id: f for f in folders}

    def path_of(folder) -> str:
        parts: list[str] = []
        cur = folder
        seen: set = set()
        while cur is not None and cur.id not in seen:
            seen.add(cur.id)
            parts.append(cur.name)
            cur = by_id.get(cur.parent_id)
        return "/".join(reversed(parts))

    signature: dict[int | None, set] = defaultdict(set)
    for folder in folders:
        signature[folder.lesson_id].add(("folder", path_of(folder)))

    files = list(
        db.execute(
            select(file_model).where(
                getattr(file_model, owner_field) == owner_id)
        ).unique().scalars().all()
    )
    for file in files:
        folder = by_id.get(file.folder_id) if file.folder_id else None
        folder_path = path_of(folder) if folder is not None else ""
        signature[file.lesson_id].add(
            ("file", folder_path, file.filename, file.content_type, file.file_size)
        )
    return signature


def material_modified_lessons(db: Session, course: CourseInstance) -> set[int | None]:
    """Lesson buckets whose material differs from the master (``None`` = course-scope)."""
    if not course.material_seeded:
        return set()
    master_sig = _material_signature(
        db, MaterialFolder, MaterialFile, "course_master_id", course.master_id
    )
    instance_sig = _material_signature(
        db,
        CourseSelectionMaterialFolder,
        CourseSelectionMaterialFile,
        "course_instance_id",
        course.id,
    )
    # Instance material is keyed by this instance's own lesson ids; the master's
    # by master lesson ids. Compare each instance lesson bucket (plus the
    # course-scope ``None`` bucket) against the master lesson it was cloned from.
    i2m = csinfo.instance_to_master_lesson_ids(course)
    modified: set[int | None] = set()
    for key in {lesson.id for lesson in csinfo.instance_lessons(course)} | {None}:
        if key is None:
            master_bucket = master_sig.get(None, set())
        else:
            master_id = i2m.get(key)
            master_bucket = master_sig.get(
                master_id, set()) if master_id is not None else set()
        if instance_sig.get(key, set()) != master_bucket:
            modified.add(key)
    return modified


def material_modified(db: Session, course: CourseInstance) -> bool:
    """True when any of this instance's material differs from the master."""
    return bool(material_modified_lessons(db, course))


# ---------------------------------------------------------------------------
# Lessons (sourced from this instance's own Course Information → Lesson Creation)
# ---------------------------------------------------------------------------

def _course_info_lessons(course: CourseInstance) -> list[CourseSelectionInfoLessonCreationLesson]:
    """Return the lessons defined for this instance's own Course Information."""
    return csinfo.instance_lessons(course)


def _validate_lesson_for_course(
    db: Session, course: CourseInstance, lesson_id: int | None
) -> None:
    """Ensure ``lesson_id`` belongs to this instance's master (or is None)."""
    if lesson_id is None:
        return
    valid_ids = {lesson.id for lesson in _course_info_lessons(course)}
    if lesson_id not in valid_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson not found for this course",
        )


def list_material_lessons(db: Session, course: CourseInstance) -> list[MaterialLessonResponse]:
    lessons = _course_info_lessons(course)
    if not lessons:
        return []
    counts = dict(
        db.execute(
            select(
                CourseSelectionMaterialFile.lesson_id,
                func.count(CourseSelectionMaterialFile.id),
            )
            .where(
                CourseSelectionMaterialFile.course_instance_id == course.id,
                CourseSelectionMaterialFile.lesson_id.is_not(None),
            )
            .group_by(CourseSelectionMaterialFile.lesson_id)
        ).all()
    )
    modified = material_modified_lessons(db, course)
    return [
        MaterialLessonResponse(
            id=lesson.id,
            lesson_number=lesson.lesson_number,
            lesson_title=lesson.lesson_title,
            order_index=lesson.order_index,
            file_count=int(counts.get(lesson.id, 0)),
            modified=lesson.id in modified,
        )
        for lesson in lessons
    ]


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------

def create_folder(
    db: Session,
    material_id: int,
    name: str,
    parent_id: UUID | None,
    lesson_id: int | None,
    created_by_id: int,
) -> CourseSelectionMaterialFolder:
    course = get_or_raise_course(db, material_id)
    if parent_id:
        parent = db.get(CourseSelectionMaterialFolder, parent_id)
        if not parent or parent.course_instance_id != course.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found")
        # Sub-folders inherit the lesson scope of their parent.
        lesson_id = parent.lesson_id
    else:
        _validate_lesson_for_course(db, course, lesson_id)

    stmt = select(CourseSelectionMaterialFolder).where(
        CourseSelectionMaterialFolder.course_instance_id == material_id,
        CourseSelectionMaterialFolder.parent_id == parent_id,
        CourseSelectionMaterialFolder.lesson_id == lesson_id,
        CourseSelectionMaterialFolder.name == name,
    )
    if db.execute(stmt).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A folder with this name already exists here",
        )

    folder = CourseSelectionMaterialFolder(
        course_instance_id=material_id,
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
) -> list[CourseSelectionMaterialFolder]:
    stmt = select(CourseSelectionMaterialFolder).where(
        CourseSelectionMaterialFolder.course_instance_id == material_id,
        CourseSelectionMaterialFolder.parent_id == parent_id,
    )
    if lesson_id is not None:
        stmt = stmt.where(CourseSelectionMaterialFolder.lesson_id == lesson_id)
    if order == "desc":
        stmt = stmt.order_by(CourseSelectionMaterialFolder.name.desc())
    else:
        stmt = stmt.order_by(CourseSelectionMaterialFolder.name.asc())
    return list(db.execute(stmt).scalars().all())


def get_folder(db: Session, folder_id: UUID) -> CourseSelectionMaterialFolder:
    folder = db.get(CourseSelectionMaterialFolder, folder_id)
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder


def rename_folder(db: Session, folder_id: UUID, name: str) -> CourseSelectionMaterialFolder:
    folder = get_folder(db, folder_id)
    stmt = select(CourseSelectionMaterialFolder).where(
        CourseSelectionMaterialFolder.course_instance_id == folder.course_instance_id,
        CourseSelectionMaterialFolder.parent_id == folder.parent_id,
        CourseSelectionMaterialFolder.lesson_id == folder.lesson_id,
        CourseSelectionMaterialFolder.name == name,
        CourseSelectionMaterialFolder.id != folder_id,
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


def _delete_folder_recursive(db: Session, folder: CourseSelectionMaterialFolder) -> None:
    """Recursively delete subfolders and files, plus their physical storage."""
    for file in list(folder.files):
        _delete_file_from_disk(file)
        sync_delete_library_material(db, file)
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
        folder = db.get(CourseSelectionMaterialFolder, current_id)
        if not folder:
            break
        breadcrumb.append(BreadcrumbItem(id=folder.id, name=folder.name))
        current_id = folder.parent_id
    breadcrumb.reverse()
    return breadcrumb


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

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
) -> CourseSelectionMaterialFile:
    course = get_or_raise_course(db, material_id)
    if folder_id:
        folder = db.get(CourseSelectionMaterialFolder, folder_id)
        if not folder or folder.course_instance_id != course.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
        # Files in a folder inherit that folder's lesson scope.
        lesson_id = folder.lesson_id
    else:
        _validate_lesson_for_course(db, course, lesson_id)

    file_record = CourseSelectionMaterialFile(
        course_instance_id=material_id,
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


def list_files(
    db: Session,
    material_id: int,
    folder_id: UUID | None,
    limit: int,
    offset: int,
    lesson_id: int | None = None,
) -> tuple[list[tuple[CourseSelectionMaterialFile, int | None]], int]:
    filters = [
        CourseSelectionMaterialFile.course_instance_id == material_id,
        CourseSelectionMaterialFile.folder_id == folder_id,
    ]
    if lesson_id is not None:
        filters.append(CourseSelectionMaterialFile.lesson_id == lesson_id)

    total_stmt = select(func.count(
        CourseSelectionMaterialFile.id)).where(*filters)
    total = int(db.execute(total_stmt).scalar_one() or 0)

    stmt = (
        select(CourseSelectionMaterialFile)
        .outerjoin(
            LibraryMaterial,
            and_(
                LibraryMaterial.file_url == CourseSelectionMaterialFile.storage_key,
                LibraryMaterial.material_type == "course",
            ),
        )
        .add_columns(LibraryMaterial.id)
        .options(selectinload(CourseSelectionMaterialFile.uploader))
        .where(*filters)
        .order_by(CourseSelectionMaterialFile.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    return [(row[0], row[1]) for row in rows], total


def get_file(db: Session, file_id: UUID) -> CourseSelectionMaterialFile:
    file_record = db.get(CourseSelectionMaterialFile, file_id)
    if not file_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return file_record


def rename_file(db: Session, file_id: UUID, filename: str) -> CourseSelectionMaterialFile:
    file_record = get_file(db, file_id)
    file_record.filename = filename
    db.commit()
    db.refresh(file_record)
    return file_record


def _delete_file_from_disk(file_record: CourseSelectionMaterialFile) -> None:
    try:
        storage.delete(file_record.storage_key)
        if file_record.thumbnail_key:
            storage.delete(file_record.thumbnail_key)
    except Exception:
        logger.exception(
            "Failed to delete instance material file storage for %s", file_record.id)


def delete_file(db: Session, file_id: UUID) -> None:
    file_record = get_file(db, file_id)
    _delete_file_from_disk(file_record)
    sync_delete_library_material(db, file_record)
    db.delete(file_record)
    db.commit()


# ---------------------------------------------------------------------------
# Cascade cleanup: delete disk files when a CourseInstance (and thus all its
# material folders/files via DB CASCADE) is being deleted.
# ---------------------------------------------------------------------------

@event.listens_for(CourseInstance, "before_delete")
def _purge_instance_material_disk_files(mapper, connection, target: CourseInstance) -> None:
    rows = connection.execute(
        select(
            CourseSelectionMaterialFile.storage_key,
            CourseSelectionMaterialFile.thumbnail_key,
        ).where(CourseSelectionMaterialFile.course_instance_id == target.id)
    ).all()
    for storage_key, thumbnail_key in rows:
        try:
            storage.delete(storage_key)
            if thumbnail_key:
                storage.delete(thumbnail_key)
        except Exception:
            logger.exception(
                "Failed to purge instance material file %s on course delete", storage_key
            )


@event.listens_for(CourseInstance, "before_delete")
def _purge_instance_library_materials(mapper, connection, target: CourseInstance) -> None:
    """Delete mirrored LibraryMaterial (and cascade MaterialSummary + UserProgress)
    for all CSM files belonging to the course being deleted."""
    keys = connection.execute(
        select(CourseSelectionMaterialFile.storage_key)
        .where(CourseSelectionMaterialFile.course_instance_id == target.id)
    ).scalars().all()

    if not keys:
        return

    connection.execute(
        delete(LibraryMaterial).where(
            LibraryMaterial.file_url.in_(keys),
            LibraryMaterial.material_type == "course",
        )
    )





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


def serialize_material(db: Session, course: CourseInstance) -> MaterialResponse:
    root_folder_count = int(
        db.execute(
            select(func.count(CourseSelectionMaterialFolder.id)).where(
                CourseSelectionMaterialFolder.course_instance_id == course.id,
                CourseSelectionMaterialFolder.parent_id.is_(None),
            )
        ).scalar_one()
        or 0
    )
    root_file_count = int(
        db.execute(
            select(func.count(CourseSelectionMaterialFile.id)).where(
                CourseSelectionMaterialFile.course_instance_id == course.id,
                CourseSelectionMaterialFile.folder_id.is_(None),
            )
        ).scalar_one()
        or 0
    )
    modified = material_modified_lessons(db, course)
    return MaterialResponse(
        id=course.id,
        course_instance_id=course.id,
        title=course.title,
        status=material_status_of(course),
        course_status=course.status,
        material_completion=course.material_completion,
        root_folder_count=root_folder_count,
        root_file_count=root_file_count,
        modified=bool(modified),
        course_modified=None in modified,
    )


def serialize_folder(folder: CourseSelectionMaterialFolder) -> MaterialFolderResponse:
    return MaterialFolderResponse(
        id=folder.id,
        material_id=folder.course_instance_id,
        parent_id=folder.parent_id,
        lesson_id=folder.lesson_id,
        name=folder.name,
        created_by_id=folder.created_by_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


def serialize_file(
    file_record: CourseSelectionMaterialFile,
    download_url: str | None = None,
    library_material_id: int | None = None,
) -> MaterialFileResponse:
    return MaterialFileResponse(
        id=file_record.id,
        material_id=file_record.course_instance_id,
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
        total_pages=file_record.total_pages,
    )


def serialize_upload(
    file_record: CourseSelectionMaterialFile,
    library_material_id: int | None = None,
) -> MaterialFileUploadResponse:
    return MaterialFileUploadResponse(
        id=file_record.id,
        filename=file_record.filename,
        content_type=file_record.content_type,
        file_size=file_record.file_size,
        library_material_id=library_material_id,
        total_pages=file_record.total_pages,
    )


# ---------------------------------------------------------------------------
# Shared / existing material files (duplicate from another lesson)
# ---------------------------------------------------------------------------

def list_shared_files(
    db: Session,
    material_id: int,
    exclude_lesson_id: int | None = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[tuple[CourseSelectionMaterialFile, int]], int]:
    """List files from *other* lessons (files that can be duplicated)."""
    filters = [
        CourseSelectionMaterialFile.course_instance_id == material_id,
        CourseSelectionMaterialFile.lesson_id.isnot(None),
    ]
    if exclude_lesson_id is not None:
        filters.append(CourseSelectionMaterialFile.lesson_id !=
                       exclude_lesson_id)

    total_stmt = select(func.count(
        CourseSelectionMaterialFile.id)).where(*filters)
    total = int(db.execute(total_stmt).scalar_one() or 0)

    stmt = (
        select(CourseSelectionMaterialFile)
        .outerjoin(
            LibraryMaterial,
            and_(
                LibraryMaterial.file_url == CourseSelectionMaterialFile.storage_key,
                LibraryMaterial.material_type == "course",
            ),
        )
        .add_columns(LibraryMaterial.id)
        .options(selectinload(CourseSelectionMaterialFile.uploader))
        .where(*filters)
        .order_by(CourseSelectionMaterialFile.filename.asc())
        .offset(offset)
        .limit(limit)
    )

    rows = db.execute(stmt).all()
    return [(row[0], row[1]) for row in rows], total
    # return list(db.execute(stmt).scalars().all()), total


def duplicate_file(
    db: Session,
    material_id: int,
    file_id: UUID,
    target_lesson_id: int | None,
    user_id: int,
) -> CourseSelectionMaterialFile:
    """Create a new material-file record pointing to the same physical storage
    key as an existing file, but scoped to a different lesson (or None)."""
    get_or_raise_course(db, material_id)
    source = get_file(db, file_id)

    if source.course_instance_id != material_id:
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

    # Check for duplicate (same lesson + same filename + same folder)
    stmt = select(CourseSelectionMaterialFile).where(
        CourseSelectionMaterialFile.course_instance_id == material_id,
        CourseSelectionMaterialFile.filename == source.filename,
        CourseSelectionMaterialFile.lesson_id == target,
        CourseSelectionMaterialFile.folder_id == source.folder_id,
        CourseSelectionMaterialFile.id != file_id,
    )
    if db.execute(stmt).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'"{source.filename}" already exists in the target lesson',
        )

    new_record = CourseSelectionMaterialFile(
        course_instance_id=material_id,
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
    # Verify LibraryMaterial exists for this shared storage_key (since duplicate shares key)
    existing_lib = db.query(LibraryMaterial).filter(
        LibraryMaterial.file_url == source.storage_key,
        LibraryMaterial.material_type == "course",
    ).first()
    if not existing_lib:
        try:
            from app.modules.material.services import sync_material_to_library as _sync_lib
            lib_id = _sync_lib(db, new_record, total_pages=new_record.total_pages)
            if lib_id is not None:
                from app.modules.library.services import get_or_create_summary_by_type
                from app.modules.library.scheduler import trigger_summarize
                get_or_create_summary_by_type(db, "course", lib_id)
                trigger_summarize(lib_id)
        except Exception:
            logger.exception("Failed to sync duplicate file to Library %s", new_record.id)
    db.commit()
    db.refresh(new_record)
    return new_record


def serialize_shared_file(
    file_record: CourseSelectionMaterialFile,
    download_url: str | None = None,
    library_material_id: int | None = None,
) -> dict:
    """Serialize a file for the shared-file list, adding source lesson info."""
    return {
        "id": file_record.id,
        "material_id": file_record.course_instance_id,
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
        "total_pages": file_record.total_pages,
    }


# ---------------------------------------------------------------------------
# Phase 3: Sync CSM uploads with Library for summarization
# ---------------------------------------------------------------------------

def create_library_material_for_cs_file(
    db: Session, cs_file: CourseSelectionMaterialFile, total_pages: int = 0
) -> "LibraryMaterial":
    """Create a mirroring LibraryMaterial for a CSM file upload.

    The file is stored once (shared storage via file_sharing).  This creates
    only the metadata row so the file appears in the Library Course tab and
    triggers the summarisation pipeline.
    """
    from datetime import datetime

    from app.modules.library.models import LibraryMaterial
    import json

    # Avoid creating a duplicate if one already exists (idempotent)
    existing = db.query(LibraryMaterial).filter(
        LibraryMaterial.file_url == cs_file.storage_key,
        LibraryMaterial.material_type == "course",
    ).first()
    if existing is not None:
        return existing

    course = get_or_raise_course(db, cs_file.course_instance_id)
    metadata_json = json.dumps({"course": course.title})

    lib_material = LibraryMaterial(
        file_id=str(cs_file.id),
        file_url=cs_file.storage_key,
        file_name=cs_file.filename,
        content_type=cs_file.content_type,
        file_size=cs_file.file_size,
        title=cs_file.filename,
        description="",
        category="Course",
        material_type="course",
        version="1",
        upload_date=datetime.utcnow(),
        folder="",
        uploaded_by=cs_file.uploader.full_name if cs_file.uploader else None,
        approved_status="pending",
        metadata_json=metadata_json,
        totalPages=total_pages,
    )
    db.add(lib_material)
    db.commit()
    db.refresh(lib_material)
    return lib_material


def approve_library_materials_for_cs(db: Session, course_id: int) -> int:
    """Approve all LibraryMaterial rows tied to a CSM course.

    Scans every CSM file belonging to *course_id*, finds the mirrored
    LibraryMaterial rows (material_type='course') that share the same
    storage_key, and bulk-approves them.  Returns the number of rows updated.
    """
    from sqlalchemy import update

    # Build a set of storage_keys owned by this course's CSM files
    storage_keys = {
        row.storage_key
        for row in db.query(CourseSelectionMaterialFile.storage_key)
        .filter(CourseSelectionMaterialFile.course_instance_id == course_id)
        .all()
        # .scalars()
    }
    if not storage_keys:
        return 0

    result = db.execute(
        update(LibraryMaterial)
        .where(
            LibraryMaterial.file_url.in_(storage_keys),
            LibraryMaterial.material_type == "course",
            LibraryMaterial.approved_status == "pending",
        )
        .values(approved_status="approved")
    )
    db.commit()
    return result.rowcount


def sync_delete_library_material(db: Session, cs_file: CourseSelectionMaterialFile) -> None:
    """Delete the mirrored LibraryMaterial (and summary/progress) for a CSM file.

    Idempotent — no-op if no matching LibraryMaterial is found.
    Does not manage transactions — caller must commit.
    """
    from app.modules.library.models import LibraryMaterial, LibraryMaterialUserProgress, MaterialSummary

    lib_mat = db.query(LibraryMaterial).filter(
        LibraryMaterial.file_url == cs_file.storage_key,
        LibraryMaterial.material_type == "course",
    ).first()
    if not lib_mat:
        return

    try:
        # Remove summary (cascade via relationship is not reliable from bare
        # session here — delete explicitly)
        db.query(MaterialSummary).filter(
            MaterialSummary.material_type == "course",
            MaterialSummary.id == lib_mat.id,
        ).delete(synchronize_session="fetch")

        # Remove user progress rows
        db.query(LibraryMaterialUserProgress).filter(
            LibraryMaterialUserProgress.material_id == lib_mat.id,
        ).delete(synchronize_session="fetch")

        # Remove the LibraryMaterial row itself
        db.query(LibraryMaterial).filter(
            LibraryMaterial.id == lib_mat.id,
        ).delete(synchronize_session="fetch")
    except Exception:
        logger.exception(
            "Failed to sync-delete LibraryMaterial for CSM file %s",
            str(cs_file.id),
        )


def sync_update_library_material(
    db: Session, cs_file: CourseSelectionMaterialFile
) -> None:
    """Update the mirrored LibraryMaterial when a CSM file is renamed."""
    from app.modules.library.models import LibraryMaterial

    lib_mat = db.query(LibraryMaterial).filter(
        LibraryMaterial.file_url == cs_file.storage_key,
        LibraryMaterial.material_type == "course",
    ).first()
    if not lib_mat:
        return

    lib_mat.title = cs_file.filename
    lib_mat.file_name = cs_file.filename
    lib_mat.content_type = cs_file.content_type
    lib_mat.file_size = cs_file.file_size
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Failed to sync-update LibraryMaterial for CSM file %s", str(
                cs_file.id)
        )
