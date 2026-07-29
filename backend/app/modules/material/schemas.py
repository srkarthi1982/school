from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserReference(BaseModel):
    id: int
    username: str
    full_name: str
    model_config = ConfigDict(from_attributes=True)


class MaterialResponse(BaseModel):
    id: int
    course_master_id: int
    title: str
    status: str
    course_master_status: str
    course_master_completion: int
    root_folder_count: int
    root_file_count: int
    model_config = ConfigDict(from_attributes=True)


class MaterialStatusResponse(BaseModel):
    material_id: int
    status: str
    course_master_completion: int


class MaterialFolderCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: UUID | None = None
    lesson_id: int | None = None


class MaterialFolderRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class MaterialFolderResponse(BaseModel):
    id: UUID
    material_id: int
    parent_id: UUID | None
    lesson_id: int | None = None
    name: str
    created_by_id: int | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class MaterialFolderListResponse(BaseModel):
    items: list[MaterialFolderResponse]
    total: int


class MaterialFileRenameRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)


class MaterialFileResponse(BaseModel):
    id: UUID
    material_id: int
    folder_id: UUID | None
    lesson_id: int | None = None
    filename: str
    content_type: str
    file_size: int
    uploader: UserReference | None = None
    created_at: datetime
    updated_at: datetime
    download_url: str | None = None
    library_material_id: int | None = None
    total_pages: int = 0
    model_config = ConfigDict(from_attributes=True)


class MaterialFileListResponse(BaseModel):
    items: list[MaterialFileResponse]
    total: int
    limit: int
    offset: int


class MaterialFileUploadResponse(BaseModel):
    id: UUID
    filename: str
    content_type: str
    file_size: int
    library_material_id: int | None = None
    total_pages: int = 0
    model_config = ConfigDict(from_attributes=True)


class BreadcrumbItem(BaseModel):
    id: UUID
    name: str


class MaterialLessonResponse(BaseModel):
    """One lesson the course's material is organised under.

    Sourced live from the Course Information → Lesson Creation step
    (``course_info_lesson_creation_lessons``); ``file_count`` is the number of
    material files uploaded under this lesson.
    """

    id: int
    lesson_number: str | None = None
    lesson_title: str | None = None
    order_index: int
    file_count: int


class MaterialLessonListResponse(BaseModel):
    items: list[MaterialLessonResponse]
    total: int


class SharedMaterialFile(BaseModel):
    """A material file from another lesson within the same material.

    Returned alongside ``source_lesson`` so the user knows where the file
    was originally uploaded.
    """

    id: UUID
    material_id: int
    folder_id: UUID | None
    lesson_id: int
    filename: str
    content_type: str
    file_size: int
    uploader: UserReference | None = None
    created_at: datetime
    updated_at: datetime
    download_url: str | None = None
    source_lesson_id: int
    source_lesson_number: str | None = None
    source_lesson_title: str | None = None
    library_material_id: int | None = None
    total_pages: int = 0


class SharedMaterialFileListResponse(BaseModel):
    items: list[SharedMaterialFile]
    total: int


class AddMaterialRequest(BaseModel):
    """Request body for duplicating a file into a different lesson."""

    file_id: UUID
    target_lesson_id: int | None = None
