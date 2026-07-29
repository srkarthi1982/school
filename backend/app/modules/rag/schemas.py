from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class RagSearchRequest(BaseModel):
    query: str
    top_k: int | None = Field(default=None, ge=1, le=50)


class RagSearchHit(BaseModel):
    chunk_id: str
    source_type: str
    document_title: str
    page_no: int | None = None
    content: str
    score: float
    course_instance_id: int | None = None
    library_material_id: int | None = None


class RagSearchResponse(BaseModel):
    query: str
    hits: list[RagSearchHit]


class RagReindexRequest(BaseModel):
    source_type: str = Field(description="'course_material' or 'library'")
    source_id: str = Field(description="UUID (course material file) or int (library material) as text")


# ---------------------------------------------------------------------------
# Admin / inspection
# ---------------------------------------------------------------------------
class RagIngestionError(BaseModel):
    source_type: str
    source_id: str
    attempts: int
    error: str | None = None


class RagAdminStats(BaseModel):
    total_chunks: int
    chunks_by_source: dict[str, int]
    documents: dict[str, int]
    # Deduplication metrics: how many done source bindings there are, how many
    # distinct contents they point at, and the difference (re-ingests avoided).
    source_bindings: int = 0
    unique_contents: int = 0
    deduplicated_documents: int = 0
    ingestion_by_status: dict[str, int]
    # Bindings whose source row is gone: dead weight awaiting gc, never indexable.
    # Reported apart from the status histogram so they never read as pending work.
    orphan_bindings: int = 0
    errors: list[RagIngestionError]


class RagChunkMeta(BaseModel):
    chunk_id: str
    source_type: str
    document_title: str
    page_no: int | None = None
    chunk_index: int
    content_chars: int
    content_preview: str
    indexed_at: datetime
    content_hash: str
    course_instance_id: int | None = None
    library_material_id: int | None = None


class RagChunkDetail(RagChunkMeta):
    content: str


class RagSearchDebugRequest(BaseModel):
    query: str
    top_k: int | None = Field(default=None, ge=1, le=50)
    hybrid: bool | None = Field(default=None, description="Override hybrid on/off; null = server default")
    scope: Literal["mine", "all"] = Field(default="mine", description="'all' bypasses access filter (admin QA)")


class RagSearchDebugHit(BaseModel):
    chunk_id: str
    source_type: str
    document_title: str
    page_no: int | None = None
    content: str
    cosine: float | None = None
    dense_rank: int | None = None
    kw_rank: int | None = None
    rrf_score: float | None = None
    course_instance_id: int | None = None
    library_material_id: int | None = None


class RagSearchDebugResponse(BaseModel):
    query: str
    scope: str
    hybrid: bool
    hits: list[RagSearchDebugHit]


class RagIngestRunResult(BaseModel):
    status: Literal["scheduled", "disabled"]
    # Populated when status is 'disabled': why the sweep was not started.
    reason: str | None = None


class RagIngestionProgress(BaseModel):
    total: int
    indexed: int
    pending: int
    indexing: int
    error: int
    orphan_bindings: int = 0
    in_flight: int
    running: bool
    last_indexed_at: datetime | None = None
    # The failures behind the `error` count. Without them the page can say "3 errors"
    # but not what went wrong, which is where the operator actually needs to look.
    errors: list[RagIngestionError] = []
