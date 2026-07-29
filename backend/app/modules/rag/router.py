from __future__ import annotations

import dataclasses
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.limiter import limiter
from app.core.permissions import PermissionCode
from app.core.response import Meta, SuccessResponse, ok
from app.modules.agent.context import build_user_context
from app.modules.agent.tools.courses import accessible_course_ids
from app.modules.rag import services as rag_services
from app.modules.rag.schemas import (
    RagAdminStats,
    RagChunkDetail,
    RagChunkMeta,
    RagIngestionProgress,
    RagIngestRunResult,
    RagReindexRequest,
    RagSearchDebugHit,
    RagSearchDebugRequest,
    RagSearchDebugResponse,
    RagSearchHit,
    RagSearchRequest,
    RagSearchResponse,
)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["RAG"])


@router.post("/search", response_model=SuccessResponse[RagSearchResponse])
@limiter.limit(settings.RAG_SEARCH_RATE_LIMIT)
def search_materials(
    request: Request,
    body: RagSearchRequest,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_permission(PermissionCode.MATERIAL_READ, PermissionCode.LIBRARY_READ)
    ),
):
    """Semantic search over indexed course materials and library documents.

    Results are scoped to what the caller may access: course chunks by their
    accessible course instances, library chunks by the library visibility rule.
    """
    ctx = build_user_context(db, current_user)
    allowed = accessible_course_ids(ctx)
    is_library_manager = ctx.has_permission(PermissionCode.LIBRARY_MANAGE.value)

    results = rag_services.search(
        db,
        body.query,
        accessible_course_ids=allowed,
        is_library_manager=is_library_manager,
        full_name=current_user.full_name,
        top_k=body.top_k,
    )
    hits = [RagSearchHit(**dataclasses.asdict(r)) for r in results]
    return ok(RagSearchResponse(query=body.query, hits=hits))


@router.post("/reindex", response_model=SuccessResponse[dict])
def reindex_source(
    body: RagReindexRequest,
    _=Depends(require_permission(PermissionCode.ADMIN_FULL)),
):
    """Admin: force (re)indexing of one source file (fire-and-forget)."""
    from app.modules.rag.scheduler import trigger_index_source

    trigger_index_source(body.source_type, body.source_id)
    return ok({"status": "scheduled", "source_type": body.source_type, "source_id": body.source_id})


# ---------------------------------------------------------------------------
# Admin dashboard (gated admin:full)
# ---------------------------------------------------------------------------
_PREVIEW_CHARS = 300


def _chunk_meta(row) -> RagChunkMeta:
    """Build chunk metadata from a list_chunks/get_chunk mapping (chunk payload +
    one representative binding). Binding fields may be null for a chunk with no
    live binding."""
    content = row["content"] or ""
    return RagChunkMeta(
        chunk_id=str(row["chunk_id"]),
        source_type=row["source_type"] or "",
        document_title=row["document_title"] or "",
        page_no=row["page_no"],
        chunk_index=row["chunk_index"],
        content_chars=len(content),
        content_preview=content[:_PREVIEW_CHARS],
        indexed_at=row["indexed_at"],
        content_hash=row["content_hash"],
        course_instance_id=row["course_instance_id"],
        library_material_id=row["library_material_id"],
    )


@router.get("/admin/stats", response_model=SuccessResponse[RagAdminStats])
def admin_stats(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ADMIN_FULL)),
):
    return ok(RagAdminStats(**rag_services.admin_stats(db)))


@router.get("/admin/chunks", response_model=SuccessResponse[list[RagChunkMeta]])
def admin_list_chunks(
    source_type: str | None = Query(default=None),
    q: str | None = Query(default=None, description="Filter by document title"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ADMIN_FULL)),
):
    rows, total = rag_services.list_chunks(
        db, source_type=source_type, q=q, page=page, page_size=page_size
    )
    pages = (total + page_size - 1) // page_size if page_size else 0
    return ok(
        [_chunk_meta(r) for r in rows],
        meta=Meta(page=page, page_size=page_size, total=total, pages=pages),
    )


@router.get("/admin/chunks/{chunk_id}", response_model=SuccessResponse[RagChunkDetail])
def admin_get_chunk(
    chunk_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ADMIN_FULL)),
):
    row = rag_services.get_chunk(db, chunk_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Chunk not found")
    meta = _chunk_meta(row)
    return ok(RagChunkDetail(**meta.model_dump(), content=row["content"] or ""))


@router.post("/admin/search-debug", response_model=SuccessResponse[RagSearchDebugResponse])
@limiter.limit(settings.RAG_SEARCH_RATE_LIMIT)
def admin_search_debug(
    request: Request,
    body: RagSearchDebugRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.ADMIN_FULL)),
):
    if body.scope == "all":
        allowed = None  # all courses
        is_library_manager = True  # all library docs
    else:
        ctx = build_user_context(db, current_user)
        allowed = accessible_course_ids(ctx)
        is_library_manager = ctx.has_permission(PermissionCode.LIBRARY_MANAGE.value)

    hits = rag_services.search_debug(
        db,
        body.query,
        accessible_course_ids=allowed,
        is_library_manager=is_library_manager,
        full_name=current_user.full_name,
        top_k=body.top_k,
        hybrid=body.hybrid,
    )
    effective_hybrid = settings.RAG_HYBRID_ENABLED if body.hybrid is None else body.hybrid
    return ok(
        RagSearchDebugResponse(
            query=body.query,
            scope=body.scope,
            hybrid=effective_hybrid,
            hits=[RagSearchDebugHit(**dataclasses.asdict(h)) for h in hits],
        )
    )


@router.post("/admin/ingest/run", response_model=SuccessResponse[RagIngestRunResult])
def ingest_run(_=Depends(require_permission(PermissionCode.ADMIN_FULL))):
    """Run a full backfill sweep now (index approved, un-indexed source files).

    Reports WHY nothing was scheduled when that happens � a dropped click and a
    queued sweep used to be indistinguishable from the caller's side.
    """
    from app.modules.rag import scheduler as rag_scheduler

    reason = rag_scheduler.unavailable_reason()
    if reason is not None:
        return ok(RagIngestRunResult(status="disabled", reason=reason))
    rag_scheduler.trigger_backfill()
    return ok(RagIngestRunResult(status="scheduled"))


@router.get("/admin/ingest/progress", response_model=SuccessResponse[RagIngestionProgress])
def ingest_progress(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ADMIN_FULL)),
):
    from app.modules.rag import scheduler as rag_scheduler

    data = rag_services.ingestion_progress(db)
    return ok(
        RagIngestionProgress(
            **data,
            in_flight=rag_scheduler.active_count(),
            running=rag_scheduler.is_running(),
        )
    )
