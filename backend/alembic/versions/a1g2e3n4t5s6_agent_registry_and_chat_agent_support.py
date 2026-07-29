"""agent registry, agent run audit, chat agent-conversation support

Revision ID: a1g2e3n4t5s6
Revises: d7e8f9a0b1c2
Create Date: 2026-07-02 00:00:00.000000

"""
import uuid

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a1g2e3n4t5s6"
down_revision: Union[str, Sequence[str], None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ASKMAI_AGENT_ID = uuid.UUID("6a51a1a1-0000-4000-8000-a5c3a1a1a1a1")


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Agent registry
    # ------------------------------------------------------------------
    op.create_table(
        "agents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("avatar_url", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_agents_slug"),
    )

    # ------------------------------------------------------------------
    # Agent run audit trail
    # ------------------------------------------------------------------
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("agent_id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("trigger_message_id", sa.UUID(), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'running'")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["chat_conversations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_runs_conversation_id", "agent_runs", ["conversation_id"])
    op.create_index("ix_agent_runs_user_id", "agent_runs", ["user_id"])

    op.create_table(
        "agent_run_steps",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("run_id", sa.UUID(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("step_type", sa.String(length=20), nullable=False),
        sa.Column("tool_name", sa.String(length=100), nullable=True),
        sa.Column("arguments", postgresql.JSONB(), nullable=True),
        sa.Column("result_summary", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_run_steps_run_id", "agent_run_steps", ["run_id"])

    # ------------------------------------------------------------------
    # chat_conversations: agent conversations
    # ------------------------------------------------------------------
    op.add_column("chat_conversations", sa.Column("agent_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_chat_conversations_agent_id",
        "chat_conversations",
        "agents",
        ["agent_id"],
        ["id"],
    )
    op.create_index("ix_chat_conversations_agent_id", "chat_conversations", ["agent_id"])

    # ------------------------------------------------------------------
    # chat_messages: re-point PK to id alone, allow agent senders.
    # The composite PK (id, conversation_id, sender_id) cannot hold a NULL
    # sender_id. `uq_chat_messages_id` already guarantees id uniqueness and
    # the attachments FK targets id alone, so id becomes the sole PK.
    # The attachments FK is bound to the unique index, so drop/recreate it
    # around the swap.
    # ------------------------------------------------------------------
    op.drop_constraint("chat_message_attachments_message_id_fkey", "chat_message_attachments", type_="foreignkey")
    op.drop_constraint("chat_messages_pkey", "chat_messages", type_="primary")
    op.drop_constraint("uq_chat_messages_id", "chat_messages", type_="unique")
    op.create_primary_key("chat_messages_pkey", "chat_messages", ["id"])
    op.create_foreign_key(
        "chat_message_attachments_message_id_fkey",
        "chat_message_attachments",
        "chat_messages",
        ["message_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_chat_messages_conversation_created", "chat_messages", ["conversation_id", "created_at"])

    op.alter_column("chat_messages", "sender_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("chat_messages", sa.Column("sender_agent_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_chat_messages_sender_agent_id",
        "chat_messages",
        "agents",
        ["sender_agent_id"],
        ["id"],
    )
    op.create_check_constraint(
        "ck_chat_messages_sender_present",
        "chat_messages",
        "sender_id IS NOT NULL OR sender_agent_id IS NOT NULL",
    )

    # ------------------------------------------------------------------
    # Seed the AskMAI agent; retire the legacy AskMAI user account.
    # ------------------------------------------------------------------
    op.execute(
        sa.text(
            "INSERT INTO agents (id, slug, display_name, description, is_active) "
            "VALUES (:id, 'askmai', 'AskMAI', "
            "'JAI AI assistant. Answers questions and helps you use the system.', true)"
        ).bindparams(id=str(ASKMAI_AGENT_ID))
    )
    op.execute("UPDATE users SET is_active = false WHERE lower(username) = 'askmai'")


def downgrade() -> None:
    # Agent messages/conversations cannot exist under the old schema.
    op.execute("DELETE FROM chat_messages WHERE sender_agent_id IS NOT NULL")
    op.execute(
        "DELETE FROM chat_conversations WHERE agent_id IS NOT NULL"
    )

    op.drop_constraint("ck_chat_messages_sender_present", "chat_messages", type_="check")
    op.drop_constraint("fk_chat_messages_sender_agent_id", "chat_messages", type_="foreignkey")
    op.drop_column("chat_messages", "sender_agent_id")
    op.alter_column("chat_messages", "sender_id", existing_type=sa.Integer(), nullable=False)

    op.drop_index("ix_chat_messages_conversation_created", table_name="chat_messages")
    op.drop_constraint("chat_message_attachments_message_id_fkey", "chat_message_attachments", type_="foreignkey")
    op.drop_constraint("chat_messages_pkey", "chat_messages", type_="primary")
    op.create_primary_key("chat_messages_pkey", "chat_messages", ["id", "conversation_id", "sender_id"])
    op.create_unique_constraint("uq_chat_messages_id", "chat_messages", ["id"])
    op.create_foreign_key(
        "chat_message_attachments_message_id_fkey",
        "chat_message_attachments",
        "chat_messages",
        ["message_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_index("ix_chat_conversations_agent_id", table_name="chat_conversations")
    op.drop_constraint("fk_chat_conversations_agent_id", "chat_conversations", type_="foreignkey")
    op.drop_column("chat_conversations", "agent_id")

    op.drop_index("ix_agent_run_steps_run_id", table_name="agent_run_steps")
    op.drop_table("agent_run_steps")
    op.drop_index("ix_agent_runs_user_id", table_name="agent_runs")
    op.drop_index("ix_agent_runs_conversation_id", table_name="agent_runs")
    op.drop_table("agent_runs")
    op.drop_table("agents")
