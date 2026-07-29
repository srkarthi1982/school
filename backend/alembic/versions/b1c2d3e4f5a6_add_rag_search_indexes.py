"""Add ANN + GIN indexes for RAG search.

Without these every /rag/search (and agent search_materials call) sequential-scans
document_chunks twice: the dense branch sorts the whole table by embedding distance
and the keyword branch scans tsv. HNSW (pgvector >= 0.5) is preferred; older
pgvector falls back to IVFFlat. The tsv column gets a GIN index for the FTS branch.

Revision ID: b1c2d3e4f5a6
Revises: d2e4f6a8b0c1
Create Date: 2026-07-08
"""
from alembic import context, op

# revision identifiers, used by Alembic.
revision = "b1c2d3e4f5a6"
down_revision = "d2e4f6a8b0c1"
branch_labels = None
depends_on = None


def _pgvector_supports_hnsw() -> bool:
    if context.is_offline_mode():
        # --sql rendering cannot query the server; assume a modern pgvector.
        return True
    row = op.get_bind().exec_driver_sql(
        "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
    ).fetchone()
    if row is None:
        return False
    parts = str(row[0]).split(".")
    try:
        major, minor = int(parts[0]), int(parts[1])
    except (IndexError, ValueError):
        return False
    return (major, minor) >= (0, 5)


def upgrade() -> None:
    if _pgvector_supports_hnsw():
        op.execute(
            "CREATE INDEX ix_document_chunks_embedding_hnsw ON document_chunks "
            "USING hnsw (embedding vector_cosine_ops)"
        )
    else:
        op.execute(
            "CREATE INDEX ix_document_chunks_embedding_ivfflat ON document_chunks "
            "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
        )
    op.execute("CREATE INDEX ix_document_chunks_tsv_gin ON document_chunks USING gin (tsv)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_tsv_gin")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_hnsw")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_ivfflat")
