from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import LargeBinary
from sqlalchemy import Boolean, Computed, DateTime, Index, Integer, String, Text, UniqueConstraint, LargeBinary
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin

# bge-m3 embedding dimension. MUST match settings.EMBEDDING_DIM and the pgvector
# column created in the Alembic migration. Kept a literal so the ORM column and
# the migration never drift.
EMBEDDING_DIM = 1024

SOURCE_COURSE_MATERIAL = "course_material"
SOURCE_LIBRARY = "library"


class DocumentChunk(TimestampMixin, Base):
    """One embedded chunk of a *unique* document, keyed by ``content_hash``.

    Content is stored ONCE per distinct file (identified by the sha256 of its
    bytes) and shared across every source that references it. The source binding
    and access control live in ``RagIngestionState`` (one row per source file),
    NOT here — a chunk has no owner. Retrieval joins chunks → bindings → the live
    source tables so the ACL is always fresh, and a document uploaded in two
    course instances (or as course material *and* a library doc) links to this
    same chunk row instead of being converted + embedded again.

    The natural key of a chunk is ``(content_hash, chunk_index)`` — identical
    bytes always chunk the same way — enforced by a unique constraint.
    """

    __tablename__ = "document_chunks"

    # Indexes are declared so autogenerate keeps them (the ANN + GIN indexes are
    # physically created by raw SQL in migration b1c2d3e4f5a6 — HNSW needs
    # pgvector >= 0.5; an older deployment on the ivfflat fallback is the one case
    # where model and DB differ, which is acceptable). The unique constraint is
    # what makes the content deduplicated.
    __table_args__ = (
        UniqueConstraint("content_hash", "chunk_index", name="uq_document_chunks_hash_index"),
        Index("ix_document_chunks_tsv_gin", "tsv", postgresql_using="gin"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # sha256 of the source file bytes — the document identity. Every source that
    # produced these exact bytes links to this content via its binding.
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # chunk payload + metadata
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ANN index (hnsw, or ivfflat on old pgvector) lives in the Alembic
    # migration b1c2d3e4f5a6_add_rag_search_indexes — not declared here.
    embedding: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    # Full-text vector for the keyword branch of hybrid search. Generated in the
    # DB from `content` (config 'simple': tokenise + lowercase, no stemming — fine
    # for Arabic + English keyword matching). Read-only from the ORM. GIN index
    # in migration b1c2d3e4f5a6_add_rag_search_indexes.
    tsv: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('simple', content)", persisted=True),
        nullable=True,
    )

    # "chunking time" — when this chunk was produced/embedded.
    indexed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class RagIngestionState(TimestampMixin, Base):
    """Per source-file watermark AND the binding that links one source to shared
    content. ``source_id`` holds the source file's id as text (UUID for course
    material, int for library); ``content_hash`` links to the deduplicated
    ``DocumentChunk`` rows.

    The ACL columns (course_instance_id / library_material_id / …) are the access
    scope for THIS source — search reads them (not the chunk) so identical content
    reached from two sources is each governed by its own permissions. ``hidden``
    hides a binding from search **without** deleting its content (non-destructive
    version supersession): the chunks stay, the row stays ``done``, so the
    document is still directly resolvable and can always be re-indexed.
    """

    __tablename__ = "rag_ingestion_state"
    __table_args__ = (
        UniqueConstraint("source_type", "source_id", name="uq_rag_ingestion_source"),
        Index("ix_rag_ingestion_content_hash", "content_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    indexed_ts: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- binding: ACL scope + display for this source (moved off DocumentChunk) ---
    # Plain typed columns, no FK: content is decoupled from the source tables and
    # orphans are reaped by the GC sweep (see services.gc_orphans), so deleting a
    # source no longer cascade-drops content shared by other sources.
    course_material_file_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    course_instance_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    library_material_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    document_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")


__all__ = [
    "DocumentChunk",
    "RagIngestionState",
    "EMBEDDING_DIM",
    "SOURCE_COURSE_MATERIAL",
    "SOURCE_LIBRARY",
]
