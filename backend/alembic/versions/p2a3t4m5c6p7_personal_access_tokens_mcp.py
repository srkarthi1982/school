"""personal access tokens + agent_runs channel for MCP

Revision ID: p2a3t4m5c6p7
Revises: a1g2e3n4t5s6
Create Date: 2026-07-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "p2a3t4m5c6p7"
down_revision: Union[str, Sequence[str], None] = "a1g2e3n4t5s6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "personal_access_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("token_prefix", sa.String(length=16), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_personal_access_tokens_token_hash"),
    )
    op.create_index("ix_personal_access_tokens_user_id", "personal_access_tokens", ["user_id"])

    # MCP tool calls audit as agent_runs with channel='mcp' and no agent.
    op.alter_column("agent_runs", "agent_id", existing_type=sa.UUID(), nullable=True)
    op.add_column(
        "agent_runs",
        sa.Column("channel", sa.String(length=10), nullable=False, server_default=sa.text("'chat'")),
    )


def downgrade() -> None:
    op.execute("DELETE FROM agent_runs WHERE agent_id IS NULL")
    op.drop_column("agent_runs", "channel")
    op.alter_column("agent_runs", "agent_id", existing_type=sa.UUID(), nullable=False)
    op.drop_index("ix_personal_access_tokens_user_id", table_name="personal_access_tokens")
    op.drop_table("personal_access_tokens")
