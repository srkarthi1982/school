from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UsageEvent(Base):
    """One row per tracked (authenticated, non-poll) HTTP request.

    Append-only and short-lived: rolled up nightly into the ``daily_*`` tables
    and purged after ``ANALYTICS_RETENTION_DAYS``. The ``feature`` label is not
    stored here — it is resolved from ``path`` at query/rollup time via the
    curated map in ``feature_map.py`` so groupings can be changed retroactively.
    """

    __tablename__ = "usage_events"

    __table_args__ = (
        Index("ix_usage_events_ip", "ip"),
        Index("ix_usage_events_user_id", "user_id"),
        Index("ix_usage_events_ip_ts", "ip", "timestamp"),
        Index("ix_usage_events_user_ts", "user_id", "timestamp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # SET NULL (not CASCADE): keep historical events if a user is deleted.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    path: Mapped[str] = mapped_column(String(512))
    method: Mapped[str] = mapped_column(String(10))
    status: Mapped[int] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ConcurrencySnapshot(Base):
    """Distinct users active in the trailing window, sampled every N minutes.

    ``bucket_ts`` is the sample time floored to the snapshot interval and is
    UNIQUE so that both uvicorn workers writing the same tick collapse to one
    row (``INSERT ... ON CONFLICT DO NOTHING``). Avg/max concurrency are
    aggregates over these rows.
    """

    __tablename__ = "concurrency_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bucket_ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    active_users: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        Index("ix_concurrency_snapshots_bucket_ts", "bucket_ts"),
        UniqueConstraint("bucket_ts", name="uq_concurrency_snapshots_bucket_ts"),
    )


class DailyUserUsage(Base):
    """Per user × day rollup of activity."""

    __tablename__ = "daily_user_usage"
    __table_args__ = (UniqueConstraint("day", "user_id", name="uq_daily_user_usage_day_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_count: Mapped[int] = mapped_column(Integer, default=0)
    login_count: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class DailyFeatureUsage(Base):
    """Per feature × day rollup. ``feature`` is the resolved curated label."""

    __tablename__ = "daily_feature_usage"
    __table_args__ = (UniqueConstraint("day", "feature", name="uq_daily_feature_usage_day_feature"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    feature: Mapped[str] = mapped_column(String(100), index=True)
    distinct_users: Mapped[int] = mapped_column(Integer, default=0)
    visits: Mapped[int] = mapped_column(Integer, default=0)
    request_count: Mapped[int] = mapped_column(Integer, default=0)


class DailyIpUsage(Base):
    """Per client IP × day rollup (the 'terminal' breakdown)."""

    __tablename__ = "daily_ip_usage"
    __table_args__ = (UniqueConstraint("day", "ip", name="uq_daily_ip_usage_day_ip"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    ip: Mapped[str] = mapped_column(String(64), index=True)
    distinct_users: Mapped[int] = mapped_column(Integer, default=0)
    request_count: Mapped[int] = mapped_column(Integer, default=0)
