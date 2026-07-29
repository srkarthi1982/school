"""usage analytics tables: events, concurrency snapshots, daily rollups

Revision ID: u5a6g7e8v9a0
Revises: m1e2m3o4r5y6
Create Date: 2026-07-04 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "u5a6g7e8v9a0"
down_revision = "m1e2m3o4r5y6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usage_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("path", sa.String(512), nullable=False),
        sa.Column("method", sa.String(10), nullable=False),
        sa.Column("status", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_usage_events_user_id", "usage_events", ["user_id"])
    op.create_index("ix_usage_events_ip", "usage_events", ["ip"])
    op.create_index("ix_usage_events_timestamp", "usage_events", ["timestamp"])
    op.create_index("ix_usage_events_user_ts", "usage_events", ["user_id", "timestamp"])
    op.create_index("ix_usage_events_ip_ts", "usage_events", ["ip", "timestamp"])

    op.create_table(
        "concurrency_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bucket_ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("active_users", sa.Integer(), nullable=False),
        sa.UniqueConstraint("bucket_ts", name="uq_concurrency_snapshots_bucket_ts"),
    )
    op.create_index("ix_concurrency_snapshots_bucket_ts", "concurrency_snapshots", ["bucket_ts"])

    op.create_table(
        "daily_user_usage",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("login_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("day", "user_id", name="uq_daily_user_usage_day_user"),
    )
    op.create_index("ix_daily_user_usage_day", "daily_user_usage", ["day"])
    op.create_index("ix_daily_user_usage_user_id", "daily_user_usage", ["user_id"])

    op.create_table(
        "daily_feature_usage",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("feature", sa.String(100), nullable=False),
        sa.Column("distinct_users", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("visits", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("day", "feature", name="uq_daily_feature_usage_day_feature"),
    )
    op.create_index("ix_daily_feature_usage_day", "daily_feature_usage", ["day"])
    op.create_index("ix_daily_feature_usage_feature", "daily_feature_usage", ["feature"])

    op.create_table(
        "daily_ip_usage",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("ip", sa.String(64), nullable=False),
        sa.Column("distinct_users", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("day", "ip", name="uq_daily_ip_usage_day_ip"),
    )
    op.create_index("ix_daily_ip_usage_day", "daily_ip_usage", ["day"])
    op.create_index("ix_daily_ip_usage_ip", "daily_ip_usage", ["ip"])


def downgrade() -> None:
    op.drop_table("daily_ip_usage")
    op.drop_table("daily_feature_usage")
    op.drop_table("daily_user_usage")
    op.drop_index("ix_concurrency_snapshots_bucket_ts", table_name="concurrency_snapshots")
    op.drop_table("concurrency_snapshots")
    op.drop_index("ix_usage_events_ip_ts", table_name="usage_events")
    op.drop_index("ix_usage_events_user_ts", table_name="usage_events")
    op.drop_index("ix_usage_events_timestamp", table_name="usage_events")
    op.drop_index("ix_usage_events_ip", table_name="usage_events")
    op.drop_index("ix_usage_events_user_id", table_name="usage_events")
    op.drop_table("usage_events")
