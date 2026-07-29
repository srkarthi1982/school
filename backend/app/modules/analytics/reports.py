"""Read-side aggregation queries backing the /analytics endpoints.

Metrics that need distinct-users-over-a-range are computed from raw
``usage_events`` (correct within the 90-day retention window, today included).
Feature ``visits`` come from the summable ``daily_feature_usage`` rollups, and
concurrency from ``concurrency_snapshots``.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, case, distinct, func
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.modules.users.models import User

from .feature_map import FEATURE_CATALOG, resolve_feature
from .models import ConcurrencySnapshot, DailyFeatureUsage, UsageEvent
from .schemas import (
    ConcurrencyDayPoint,
    ConcurrencyResponse,
    FeaturesResponse,
    FeatureUsageRow,
    OverviewResponse,
    TerminalsResponse,
    TerminalUsageRow,
    TrendPoint,
    UsersResponse,
    UserUsageRow,
)

_LOGIN_PATH = "/api/v1/auth/login"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _distinct_active(db: Session, since: datetime) -> int:
    return (
        db.query(func.count(distinct(UsageEvent.user_id)))
        .filter(UsageEvent.timestamp >= since, UsageEvent.user_id.isnot(None))
        .scalar()
    ) or 0


def overview(db: Session, days: int) -> OverviewResponse:
    now = _now()
    start = now - timedelta(days=days)

    registered_total = db.query(func.count(User.id)).scalar() or 0
    registered_active = (
        db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar()
    ) or 0

    day_col = func.date(UsageEvent.timestamp)
    trend_rows = (
        db.query(day_col.label("d"), func.count(distinct(UsageEvent.user_id)))
        .filter(UsageEvent.timestamp >= start, UsageEvent.user_id.isnot(None))
        .group_by(day_col)
        .order_by(day_col)
        .all()
    )

    return OverviewResponse(
        registered_total=registered_total,
        registered_active=registered_active,
        dau=_distinct_active(db, now - timedelta(days=1)),
        wau=_distinct_active(db, now - timedelta(days=7)),
        mau=_distinct_active(db, now - timedelta(days=30)),
        active_in_range=_distinct_active(db, start),
        range_days=days,
        trend=[TrendPoint(day=str(d), active_users=n) for d, n in trend_rows],
    )


def concurrency(db: Session, days: int) -> ConcurrencyResponse:
    now = _now()
    start = now - timedelta(days=days)

    avg_val, max_val = (
        db.query(
            func.avg(ConcurrencySnapshot.active_users),
            func.max(ConcurrencySnapshot.active_users),
        )
        .filter(ConcurrencySnapshot.bucket_ts >= start)
        .one()
    )

    peak_row = (
        db.query(ConcurrencySnapshot.bucket_ts)
        .filter(ConcurrencySnapshot.bucket_ts >= start)
        .order_by(
            ConcurrencySnapshot.active_users.desc(),
            ConcurrencySnapshot.bucket_ts.desc(),
        )
        .first()
    )

    day_col = func.date(ConcurrencySnapshot.bucket_ts)
    series_rows = (
        db.query(
            day_col.label("d"),
            func.avg(ConcurrencySnapshot.active_users),
            func.max(ConcurrencySnapshot.active_users),
        )
        .filter(ConcurrencySnapshot.bucket_ts >= start)
        .group_by(day_col)
        .order_by(day_col)
        .all()
    )

    return ConcurrencyResponse(
        avg_concurrent=round(float(avg_val), 2) if avg_val is not None else 0.0,
        max_concurrent=int(max_val) if max_val is not None else 0,
        peak_at=str(peak_row[0]) if peak_row else None,
        range_days=days,
        series=[
            ConcurrencyDayPoint(
                day=str(d),
                avg_concurrent=round(float(a), 2),
                max_concurrent=int(m),
            )
            for d, a, m in series_rows
        ],
    )


def users(db: Session, days: int, limit: int) -> UsersResponse:
    now = _now()
    start = now - timedelta(days=days)
    day_col = func.date(UsageEvent.timestamp)
    login_case = case(
        (
            and_(
                UsageEvent.path == _LOGIN_PATH,
                UsageEvent.method == "POST",
                UsageEvent.status >= 200,
                UsageEvent.status < 300,
            ),
            1,
        ),
        else_=0,
    )

    rows = (
        db.query(
            UsageEvent.user_id,
            func.count().label("events"),
            func.count(distinct(day_col)).label("active_days"),
            func.coalesce(func.sum(login_case), 0).label("logins"),
        )
        .filter(UsageEvent.timestamp >= start, UsageEvent.user_id.isnot(None))
        .group_by(UsageEvent.user_id)
        .order_by(func.count().desc())
        .limit(limit)
        .all()
    )

    user_ids = [r.user_id for r in rows]
    name_map: dict[int, User] = {}
    if user_ids:
        for u in (
            db.query(User)
            .options(joinedload(User.profile))
            .filter(User.id.in_(user_ids))
            .all()
        ):
            name_map[u.id] = u

    result = []
    for r in rows:
        u = name_map.get(r.user_id)
        result.append(
            UserUsageRow(
                user_id=r.user_id,
                username=u.username if u else None,
                full_name=(u.full_name if u else None),
                event_count=int(r.events),
                active_days=int(r.active_days),
                login_count=int(r.logins),
            )
        )
    return UsersResponse(range_days=days, users=result)


def features(db: Session, days: int) -> FeaturesResponse:
    now = _now()
    start = now - timedelta(days=days)

    # request_count per path → feature (small result set: distinct paths).
    req_rows = (
        db.query(UsageEvent.path, func.count())
        .filter(UsageEvent.timestamp >= start)
        .group_by(UsageEvent.path)
        .all()
    )
    # distinct (path, user) pairs → dedup to distinct users per feature.
    pair_rows = (
        db.query(UsageEvent.path, UsageEvent.user_id)
        .filter(UsageEvent.timestamp >= start, UsageEvent.user_id.isnot(None))
        .distinct()
        .all()
    )
    # visits per feature summed from completed-day rollups (summable across days).
    visit_rows = (
        db.query(DailyFeatureUsage.feature, func.coalesce(func.sum(DailyFeatureUsage.visits), 0))
        .filter(DailyFeatureUsage.day >= start.date())
        .group_by(DailyFeatureUsage.feature)
        .all()
    )

    requests: dict[str, int] = {}
    for path, cnt in req_rows:
        requests[resolve_feature(path)] = requests.get(resolve_feature(path), 0) + int(cnt)

    users_by_feature: dict[str, set] = {}
    for path, uid in pair_rows:
        users_by_feature.setdefault(resolve_feature(path), set()).add(uid)

    visits = {feature: int(v) for feature, v in visit_rows}

    # Zero-fill every catalog feature plus any discovered label (e.g. "Other").
    labels = set(FEATURE_CATALOG) | set(requests) | set(users_by_feature) | set(visits)
    # Hide operator-excluded features (case-insensitive match on the label).
    excluded = {f.strip().lower() for f in settings.ANALYTICS_EXCLUDED_FEATURES}
    rows = [
        FeatureUsageRow(
            feature=f,
            distinct_users=len(users_by_feature.get(f, ())),
            visits=visits.get(f, 0),
            request_count=requests.get(f, 0),
        )
        for f in labels
        if f.lower() not in excluded
    ]
    rows.sort(key=lambda r: (r.distinct_users, r.request_count), reverse=True)
    return FeaturesResponse(range_days=days, features=rows)


def terminals(db: Session, days: int, limit: int) -> TerminalsResponse:
    now = _now()
    start = now - timedelta(days=days)
    rows = (
        db.query(
            UsageEvent.ip,
            func.count(distinct(UsageEvent.user_id)),
            func.count(),
        )
        .filter(UsageEvent.timestamp >= start, UsageEvent.ip.isnot(None))
        .group_by(UsageEvent.ip)
        .order_by(func.count().desc())
        .limit(limit)
        .all()
    )
    return TerminalsResponse(
        range_days=days,
        terminals=[
            TerminalUsageRow(ip=ip, distinct_users=int(du), request_count=int(rc))
            for ip, du, rc in rows
        ],
    )
