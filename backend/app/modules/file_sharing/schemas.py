from __future__ import annotations
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class UserReference(BaseModel):
    id: int
    username: str
    full_name: str
    model_config = ConfigDict(from_attributes=True)


class FolderResponse(BaseModel):
    id: UUID
    parent_id: UUID | None
    name: str
    created_by_id: int | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class FolderCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: UUID | None = None


class FolderRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class FileRenameRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)


class FileResponse(BaseModel):
    id: UUID
    folder_id: UUID | None
    filename: str
    content_type: str
    file_size: int
    uploader: UserReference | None = None
    created_at: datetime
    updated_at: datetime
    download_url: str | None = None
    model_config = ConfigDict(from_attributes=True)


class FileListResponse(BaseModel):
    items: list[FileResponse]
    total: int
    limit: int
    offset: int


class FolderListResponse(BaseModel):
    items: list[FolderResponse]
    total: int


class BreadcrumbItem(BaseModel):
    id: UUID
    name: str


class UploadResponse(BaseModel):
    id: UUID
    filename: str
    content_type: str
    file_size: int
    model_config = ConfigDict(from_attributes=True)
