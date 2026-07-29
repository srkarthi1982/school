"""request module — tables, indexes, constraints, and config seed

Revision ID: e7a1c5f3b4d2
Revises: a1b2c3d4e5f6, c58c4060108d, d4f9c5b1e3a2
Create Date: 2026-05-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e7a1c5f3b4d2"
down_revision: Union[str, Sequence[str], None] = ("a1f2b3c4d5e6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("purpose", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="created"),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("current_recipient_id", sa.Integer(), nullable=True),
        sa.Column("original_recipient_id", sa.Integer(), nullable=True),
        sa.Column("recipient_pool", sa.String(length=20), nullable=True),
        sa.Column("return_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("overdue_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["current_recipient_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["original_recipient_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('created','viewed','returned','edited','resolved','approved','canceled')",
            name="ck_requests_status_valid",
        ),
        sa.CheckConstraint(
            "(recipient_pool IS NOT NULL AND current_recipient_id IS NULL) "
            "OR (recipient_pool IS NULL AND current_recipient_id IS NOT NULL)",
            name="ck_requests_pool_xor_recipient",
        ),
    )
    op.create_index("ix_requests_status", "requests", ["status"])
    op.create_index("ix_requests_created_by_id", "requests", ["created_by_id"])
    op.create_index("ix_requests_current_recipient_id", "requests", ["current_recipient_id"])
    op.create_index(
        "ix_requests_current_recipient_status",
        "requests",
        ["current_recipient_id", "status"],
    )
    op.create_index(
        "ix_requests_created_by_status",
        "requests",
        ["created_by_id", "status"],
    )
    op.create_index(
        "ix_requests_pool_status",
        "requests",
        ["recipient_pool", "status"],
    )

    op.create_table(
        "request_status_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("from_status", sa.String(length=20), nullable=True),
        sa.Column("to_status", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("forwarded_to_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["forwarded_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_request_status_history_request_id",
        "request_status_history",
        ["request_id"],
    )

    op.create_table(
        "request_notification_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("overdue_after_days", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "request_overdue_notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["admin_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_request_overdue_notifications_request_id",
        "request_overdue_notifications",
        ["request_id"],
    )
    op.create_index(
        "ix_request_overdue_admin_unread",
        "request_overdue_notifications",
        ["admin_id", "read_at"],
    )

    # Seed singleton config row.
    op.execute(
        "INSERT INTO request_notification_config (id, overdue_after_days) "
        "VALUES (1, 3)"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_request_overdue_admin_unread", table_name="request_overdue_notifications"
    )
    op.drop_index(
        "ix_request_overdue_notifications_request_id",
        table_name="request_overdue_notifications",
    )
    op.drop_table("request_overdue_notifications")

    op.drop_table("request_notification_config")

    op.drop_index(
        "ix_request_status_history_request_id",
        table_name="request_status_history",
    )
    op.drop_table("request_status_history")

    op.drop_index("ix_requests_pool_status", table_name="requests")
    op.drop_index("ix_requests_created_by_status", table_name="requests")
    op.drop_index("ix_requests_current_recipient_status", table_name="requests")
    op.drop_index("ix_requests_current_recipient_id", table_name="requests")
    op.drop_index("ix_requests_created_by_id", table_name="requests")
    op.drop_index("ix_requests_status", table_name="requests")
    op.drop_table("requests")
