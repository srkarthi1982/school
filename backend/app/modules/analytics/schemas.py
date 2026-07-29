from __future__ import annotations

from pydantic import BaseModel


class TrendPoint(BaseModel):
    day: str
    active_users: int


class OverviewResponse(BaseModel):
    registered_total: int
    registered_active: int          # users.is_active = True
    dau: int                        # distinct active in trailing 1 day
    wau: int                        # trailing 7 days
    mau: int                        # trailing 30 days
    active_in_range: int            # distinct active in the requested range
    range_days: int
    trend: list[TrendPoint]         # per-day distinct active users over the range


class ConcurrencyDayPoint(BaseModel):
    day: str
    avg_concurrent: float
    max_concurrent: int


class ConcurrencyResponse(BaseModel):
    avg_concurrent: float
    max_concurrent: int
    peak_at: str | None
    range_days: int
    series: list[ConcurrencyDayPoint]


class UserUsageRow(BaseModel):
    user_id: int
    username: str | None
    full_name: str | None
    event_count: int
    active_days: int
    login_count: int


class UsersResponse(BaseModel):
    range_days: int
    users: list[UserUsageRow]


class FeatureUsageRow(BaseModel):
    feature: str
    distinct_users: int
    visits: int
    request_count: int


class FeaturesResponse(BaseModel):
    range_days: int
    features: list[FeatureUsageRow]   # every catalog feature, zero-filled, sorted by reach


class TerminalUsageRow(BaseModel):
    ip: str
    distinct_users: int
    request_count: int


class TerminalsResponse(BaseModel):
    range_days: int
    terminals: list[TerminalUsageRow]
