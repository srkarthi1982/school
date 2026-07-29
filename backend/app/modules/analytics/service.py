"""Aggregation jobs: concurrency snapshots, nightly rollups, raw purge.

All are invoked by ``scheduler.py`` on a fresh DB session per tick.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import delete, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings

from .feature_map import resolve_feature
from .models import (
    ConcurrencySnapshot,
    DailyFeatureUsage,
    DailyIpUsage,
    DailyUserUsage,
    UsageEvent,
)

logger = logging.getLogger(__name__)

_LOGIN_PATH = "/api/v1/auth/login"


def _floor_bucket(now: datetime, minutes: int) -> datetime:
    floored = (now.minute // minutes) * minutes
    return now.replace(minute=floored, second=0, microsecond=0)


def snapshot_concurrency(db: Session, now: datetime | None = None) -> int | None:
    """Record distinct users active in the trailing window for this bucket.

    Idempotent across workers: the unique ``bucket_ts`` collapses concurrent
    inserts for the same tick to a single row. Returns the active count written,
    or None if this bucket already existed.
    """
    now = now or datetime.now(timezone.utc)
    window = timedelta(minutes=settings.ANALYTICS_ACTIVE_WINDOW_MINUTES)
    bucket_ts = _floor_bucket(now, settings.ANALYTICS_SNAPSHOT_MINUTES)

    active = (
        db.query(func.count(func.distinct(UsageEvent.user_id)))
        .filter(UsageEvent.timestamp >= now - window)
        .filter(UsageEvent.user_id.isnot(None))
        .scalar()
    ) or 0

    if db.bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        stmt = (
            pg_insert(ConcurrencySnapshot)
            .values(bucket_ts=bucket_ts, active_users=active)
            .on_conflict_do_nothing(index_elements=["bucket_ts"])
        )
        result = db.execute(stmt)
        db.commit()
        return active if result.rowcount else None

    # SQLite / others: optimistic insert, swallow the unique violation.
    try:
        db.add(ConcurrencySnapshot(bucket_ts=bucket_ts, active_users=active))
        db.commit()
        return active
    except IntegrityError:
        db.rollback()
        return None


def run_daily_rollup(db: Session, day: date | None = None) -> None:
    """Aggregate one day's raw events into the daily_* tables (idempotent).

    Defaults to the previous UTC day so it runs over a complete day. Re-running
    replaces that day's rollup rows.
    """
    if day is None:
        day = (datetime.now(timezone.utc) - timedelta(days=1)).date()

    start = datetime.combine(day, time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)

    rows = (
        db.query(
            UsageEvent.user_id,
            UsageEvent.path,
            UsageEvent.method,
            UsageEvent.status,
            UsageEvent.ip,
            UsageEvent.timestamp,
        )
        .filter(UsageEvent.timestamp >= start, UsageEvent.timestamp < end)
        .all()
    )

    user_stats: dict[int, dict] = {}
    feature_users: dict[str, set] = {}
    feature_requests: dict[str, int] = {}
    ip_users: dict[str, set] = {}
    ip_requests: dict[str, int] = {}
    uf_timestamps: dict[tuple[int, str], list[datetime]] = {}

    for user_id, path, method, status, ip, ts in rows:
        feature = resolve_feature(path)

        if user_id is not None:
            us = user_stats.setdefault(user_id, {"events": 0, "logins": 0})
            us["events"] += 1
            if path == _LOGIN_PATH and method == "POST" and 200 <= status < 300:
                us["logins"] += 1
            feature_users.setdefault(feature, set()).add(user_id)
            uf_timestamps.setdefault((user_id, feature), []).append(ts)

        feature_requests[feature] = feature_requests.get(feature, 0) + 1
        if ip:
            if user_id is not None:
                ip_users.setdefault(ip, set()).add(user_id)
            ip_requests[ip] = ip_requests.get(ip, 0) + 1

    # Visits: a burst of a user's activity in a feature, split on gaps.
    gap = timedelta(minutes=settings.ANALYTICS_VISIT_GAP_MINUTES)
    feature_visits: dict[str, int] = {}
    for (user_id, feature), stamps in uf_timestamps.items():
        stamps.sort()
        visits = 1
        for prev, cur in zip(stamps, stamps[1:]):
            if cur - prev > gap:
                visits += 1
        feature_visits[feature] = feature_visits.get(feature, 0) + visits

    # Replace any existing rollup for this day (idempotent re-run).
    db.execute(delete(DailyUserUsage).where(DailyUserUsage.day == day))
    db.execute(delete(DailyFeatureUsage).where(DailyFeatureUsage.day == day))
    db.execute(delete(DailyIpUsage).where(DailyIpUsage.day == day))

    db.bulk_save_objects([
        DailyUserUsage(
            day=day,
            user_id=uid,
            event_count=s["events"],
            login_count=s["logins"],
            active=True,
        )
        for uid, s in user_stats.items()
    ])
    db.bulk_save_objects([
        DailyFeatureUsage(
            day=day,
            feature=feature,
            distinct_users=len(feature_users.get(feature, ())),
            visits=feature_visits.get(feature, 0),
            request_count=reqs,
        )
        for feature, reqs in feature_requests.items()
    ])
    db.bulk_save_objects([
        DailyIpUsage(
            day=day,
            ip=ip,
            distinct_users=len(ip_users.get(ip, ())),
            request_count=reqs,
        )
        for ip, reqs in ip_requests.items()
    ])
    db.commit()
    logger.info(
        "analytics rollup %s: %s users, %s features, %s ips",
        day, len(user_stats), len(feature_requests), len(ip_requests),
    )


def purge_old_raw(db: Session, days: int | None = None) -> int:
    """Delete raw usage_events older than the retention window. Returns count."""
    days = days if days is not None else settings.ANALYTICS_RETENTION_DAYS
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = db.execute(delete(UsageEvent).where(UsageEvent.timestamp < cutoff))
    db.commit()
    return result.rowcount or 0
