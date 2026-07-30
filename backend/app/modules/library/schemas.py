from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from app.modules.library.models import MaterialSummary


# --- Library ---
class LibraryMaterialCreate(BaseModel):
    file_id: str
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    title: str
    description: Optional[str] = ''
    category: str
    material_type: str
    version: str
    upload_date: datetime
    folder: Optional[str] = ''
    uploaded_by: Optional[str] = None
    approved_status: Optional[str] = 'approved'
    metadata_json: Optional[str] = ''
    totalPages: Optional[int] = 0
    # pagesRead: Optional[int] = 0
    # coverimage: Optional[bytes] = None


class LibraryMaterialRead(LibraryMaterialCreate):
    id: int
    summary_ts: Optional[datetime] = None

    # NOTE: previously `class Config: orm_mode = True` sat at module level
    # (un-nested), so it never applied. In Pydantic v2 the model_config below
    # is what lets FastAPI build this response straight from the ORM object.
    model_config = ConfigDict(from_attributes=True)


class LibraryMaterialUpdate(BaseModel):
    folder: Optional[str] = None
    approved_status: Optional[str] = None
    totalPages: Optional[int] = None
    # pagesRead: Optional[int] = None
    # coverimage: Optional[bytes] = None


class AircraftViewerLaunchRead(BaseModel):
    material_id: int
    title: str
    viewer_url: str

# --- Library Material User Progress ---


class LibraryMaterialUserProgressBase(BaseModel):
    user_id: int
    material_id: int
    pages_read: Optional[int] = 0


class LibraryMaterialUserProgressCreate(LibraryMaterialUserProgressBase):
    pass


class LibraryMaterialUserProgressRead(LibraryMaterialUserProgressBase):
    user_id: int
    material_id: int

    model_config = ConfigDict(from_attributes=True)


class LibraryMaterialUserProgressUpdate(BaseModel):
    pages_read: Optional[int] = None


class MaterialSummaryRead(BaseModel):
    id: int
    version: int
    overall_summary: str | None = None
    # section_summary: str | None = None
    sections: list[dict[str, Any]] | None = None
    abbreviations: list[dict[str, str]] | None = None


class MaterialSummaryVoiceNarrationRead(BaseModel):
    id: int
    version: int
    narration_text: list[Any] | None = None


class MaterialSummaryMindmapRead(BaseModel):
    id: int
    version: int
    root_label: str | None = None
    markdown: str | None = None
    merged_tree: dict[str, Any] | None = None


class SummaryStatusRead(BaseModel):
    """Summary processing status for the frontend."""
    summary_available: bool = False
    mindmap_available: bool = False
    narrative_available: bool = False
    error_message: str | None = None

    @staticmethod
    def from_summary(summary: MaterialSummary | None) -> "SummaryStatusRead":
        if summary is None:
            return SummaryStatusRead()
        return SummaryStatusRead(
            summary_available=summary.summary is not None,
            mindmap_available=summary.mindmap is not None,
            narrative_available=summary.narrative_text is not None,
            error_message=summary.error_message,
        )


class SummaryWebhookTask(BaseModel):
    task_id: str
    status: str
    result: Optional[dict]
    error_msg: Optional[str]
