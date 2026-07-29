"""Deduplicate document_chunks by content_hash; move the source binding + ACL to
rag_ingestion_state.

Content is now stored ONCE per distinct file (keyed by content_hash) and shared
across every source that references it. The per-source binding (source columns +
ACL scope + title) moves to rag_ingestion_state, and search joins chunks → bindings
→ live source tables for access control. This removes the massive duplication of
converting + embedding + storing the same document once per course instance /
source, and — by making version supersession a non-destructive ``hidden`` flag —
fixes materials that lost their chunks and could never be re-indexed.

IRREVERSIBLE data change: duplicate chunk rows are deleted. The downgrade restores
the columns but NOT the deleted duplicates or the original per-source tagging. Take
a backup and run on staging first.

Revision ID: ragdedup0001
Revises: 1b7da618e066
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "5f4ac52f849e"
down_revision = "951b171778c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Binding columns on rag_ingestion_state (ACL scope + display, moved off the
    #    chunk). Plain columns, no FK: content is decoupled and orphans are reaped
    #    by the GC sweep.
    op.add_column(
        "rag_ingestion_state",
        sa.Column("course_material_file_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("rag_ingestion_state", sa.Column("course_instance_id", sa.Integer(), nullable=True))
    op.add_column("rag_ingestion_state", sa.Column("library_material_id", sa.Integer(), nullable=True))
    op.add_column("rag_ingestion_state", sa.Column("document_title", sa.String(length=500), nullable=True))
    op.add_column(
        "rag_ingestion_state",
        sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        "ix_rag_ingestion_content_hash", "rag_ingestion_state", ["content_hash"]
    )
    op.create_index(
        "ix_rag_ingestion_state_course_material_file_id",
        "rag_ingestion_state", ["course_material_file_id"],
    )
    op.create_index(
        "ix_rag_ingestion_state_course_instance_id",
        "rag_ingestion_state", ["course_instance_id"],
    )
    op.create_index(
        "ix_rag_ingestion_state_library_material_id",
        "rag_ingestion_state", ["library_material_id"],
    )

    # 2. Backfill the binding scope/title from the existing (about-to-be-dropped)
    #    chunk columns — one representative chunk per source.
    op.execute(
        """
        UPDATE rag_ingestion_state s SET
            course_material_file_id = sub.course_material_file_id,
            course_instance_id      = sub.course_instance_id,
            document_title          = sub.document_title
        FROM (
            SELECT DISTINCT ON (course_material_file_id)
                   course_material_file_id, course_instance_id, document_title
            FROM document_chunks
            WHERE source_type = 'course_material' AND course_material_file_id IS NOT NULL
            ORDER BY course_material_file_id, indexed_at DESC
        ) sub
        WHERE s.source_type = 'course_material'
          AND s.source_id = sub.course_material_file_id::text
        """
    )
    op.execute(
        """
        UPDATE rag_ingestion_state s SET
            library_material_id = sub.library_material_id,
            document_title      = sub.document_title
        FROM (
            SELECT DISTINCT ON (library_material_id)
                   library_material_id, document_title
            FROM document_chunks
            WHERE source_type = 'library' AND library_material_id IS NOT NULL
            ORDER BY library_material_id, indexed_at DESC
        ) sub
        WHERE s.source_type = 'library'
          AND s.source_id = sub.library_material_id::text
        """
    )
    # Bindings with no chunks (never indexed / legacy superseded): derive the FK id
    # straight from source_id so the binding still has a scope to enforce.
    op.execute(
        """
        UPDATE rag_ingestion_state SET course_material_file_id = source_id::uuid
        WHERE source_type = 'course_material' AND course_material_file_id IS NULL
          AND source_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        """
    )
    op.execute(
        """
        UPDATE rag_ingestion_state SET library_material_id = source_id::integer
        WHERE source_type = 'library' AND library_material_id IS NULL
          AND source_id ~ '^[0-9]+$'
        """
    )

    # 3. Heal legacy 'superseded' rows: the old code deleted their chunks and left
    #    them permanently un-indexable. Re-queue them so they get (non-destructively)
    #    re-indexed and hidden via the new reconcile.
    op.execute(
        "UPDATE rag_ingestion_state SET status = 'pending', indexed_ts = NULL, hidden = false "
        "WHERE status = 'superseded'"
    )

    # 4. Deduplicate chunks: keep one row per (content_hash, chunk_index). Identical
    #    bytes always chunk the same way, so the surviving row is interchangeable.
    op.execute(
        """
        DELETE FROM document_chunks a
        USING document_chunks b
        WHERE a.content_hash = b.content_hash
          AND a.chunk_index = b.chunk_index
          AND a.id > b.id
        """
    )

    # 5. Enforce the dedup and drop the per-source columns from the chunk. Dropping
    #    each column also drops its dependent index / FK constraint.
    op.create_unique_constraint(
        "uq_document_chunks_hash_index", "document_chunks", ["content_hash", "chunk_index"]
    )
    op.drop_column("document_chunks", "source_type")
    op.drop_column("document_chunks", "course_material_file_id")
    op.drop_column("document_chunks", "course_instance_id")
    op.drop_column("document_chunks", "library_material_id")
    op.drop_column("document_chunks", "document_title")


def downgrade() -> None:
    # Best-effort structural rollback. Does NOT restore deleted duplicate chunks nor
    # the original per-source tagging (that data is gone) — columns come back NULL.
    op.drop_constraint("uq_document_chunks_hash_index", "document_chunks", type_="unique")
    op.add_column("document_chunks", sa.Column("source_type", sa.String(length=32), nullable=True))
    op.add_column(
        "document_chunks",
        sa.Column("course_material_file_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("document_chunks", sa.Column("course_instance_id", sa.Integer(), nullable=True))
    op.add_column("document_chunks", sa.Column("library_material_id", sa.Integer(), nullable=True))
    op.add_column(
        "document_chunks",
        sa.Column("document_title", sa.String(length=500), nullable=False, server_default=""),
    )

    op.drop_index("ix_rag_ingestion_state_library_material_id", table_name="rag_ingestion_state")
    op.drop_index("ix_rag_ingestion_state_course_instance_id", table_name="rag_ingestion_state")
    op.drop_index("ix_rag_ingestion_state_course_material_file_id", table_name="rag_ingestion_state")
    op.drop_index("ix_rag_ingestion_content_hash", table_name="rag_ingestion_state")
    op.drop_column("rag_ingestion_state", "hidden")
    op.drop_column("rag_ingestion_state", "document_title")
    op.drop_column("rag_ingestion_state", "library_material_id")
    op.drop_column("rag_ingestion_state", "course_instance_id")
    op.drop_column("rag_ingestion_state", "course_material_file_id")
