"""Dashboard-only policy constants and pure calculation helpers.

Timestamp windows use aware UTC instants with an inclusive lower boundary and
an exclusive current-time upper boundary where a closed window is required.
Date-only planned start/end fields are compared as inclusive UTC calendar dates.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from .schemas import DashboardFilterState


QUIZ_LOW_SCORE_PERCENT = 70.0
EVALUATION_FAIL_PERCENT = 50.0
POOR_ATTENDANCE_PERCENT = 75.0
CLASS_FAILURE_ALERT_PERCENT = 40.0
LESSON_DURATION_EXCESS_PERCENT = 20.0
REPEATED_WEAKNESS_MIN_OBSERVATIONS = 2
ACTIVE_COURSE_INSTANCE_STATUSES = ("approved",)
COURSE_START_DELAY_DAYS = 0
DASHBOARD_DETAIL_LIMIT = 50
DASHBOARD_ALERT_LIMIT = 25
DASHBOARD_ALERT_SOURCE_SCAN_LIMIT = 5000


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def date_range_start(value: str) -> datetime | None:
    if value == "all":
        return None
    delta = {
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
    }.get(value)
    return utc_now() - delta if delta else None


def temporal_position(value: datetime, *, now: datetime) -> str:
    """Classify an aware instant relative to an aware UTC reference instant."""
    if value.tzinfo is None or now.tzinfo is None:
        raise ValueError("dashboard datetime comparisons require timezone-aware values")
    value_utc = value.astimezone(timezone.utc)
    now_utc = now.astimezone(timezone.utc)
    if value_utc < now_utc:
        return "past"
    if value_utc > now_utc:
        return "future"
    return "now"


def is_planned_end_delayed(
    *,
    planned_end: datetime,
    actual_end: datetime | None,
    now: datetime,
) -> bool:
    """A session is delayed after its planned end until its actual end exists."""
    comparison = actual_end or now
    return temporal_position(comparison, now=planned_end) == "future"


def score_percentage(score: float, maximum: float) -> float | None:
    """Normalize a score; zero/missing maxima cannot produce a percentage."""
    return (score / maximum) * 100 if maximum > 0 else None


def configured_pass_percentage(
    *,
    pass_mark: float,
    configured_maximum: float,
    pass_percentage: float,
) -> float:
    """Prefer configured mark/max, then configured percent, then local fallback."""
    if configured_maximum > 0 and pass_mark > 0:
        return (pass_mark / configured_maximum) * 100
    if pass_percentage > 0:
        return pass_percentage
    return QUIZ_LOW_SCORE_PERCENT


def duration_excess_percentage(
    *,
    planned_start: datetime,
    planned_end: datetime,
    actual_start: datetime,
    actual_end: datetime | None,
) -> float | None:
    """Return actual-duration excess; incomplete or naive records are unusable."""
    values = (planned_start, planned_end, actual_start)
    if actual_end is None:
        return None
    if any(value.tzinfo is None for value in (*values, actual_end)):
        raise ValueError("dashboard duration comparisons require aware datetimes")
    planned = (planned_end - planned_start).total_seconds()
    actual = (actual_end - actual_start).total_seconds()
    if planned <= 0 or actual < 0:
        return None
    return ((actual - planned) / planned) * 100


def is_duration_overrun(excess_percentage: float | None) -> bool:
    """The dashboard-local fallback triggers only above, not at, 20 percent."""
    return (
        excess_percentage is not None
        and excess_percentage > LESSON_DURATION_EXCESS_PERCENT
    )


def course_schedule_delay_days(
    *, status: str, planned_end: date | None, today: date
) -> int | None:
    """Return overdue days for approved instances past their planned end."""
    if status.casefold() not in ACTIVE_COURSE_INSTANCE_STATUSES:
        return None
    if planned_end is None or planned_end >= today:
        return None
    return (today - planned_end).days


def failure_percentage(total: int, failed: int) -> float:
    return (failed / total) * 100 if total > 0 else 0.0


def is_class_failure_alert(total: int, failed: int) -> bool:
    return failure_percentage(total, failed) > CLASS_FAILURE_ALERT_PERCENT


def scope_role_filters(
    params: DashboardFilterState,
    *,
    role: Literal["instructor", "student"],
    profile_id: int,
) -> DashboardFilterState:
    """Override caller-controlled identity filters with authenticated identity."""
    updates = {role: str(profile_id)}
    return params.model_copy(update=updates)


def classify_student_risk(
    score_percent: float | None,
    attendance_percent: float | None,
) -> tuple[str, str, str, str]:
    """Classify using only currently available score and attendance data.

    Missed mandatory training and material-engagement signals are not available.
    A score below 50% is the supported failed-evaluation proxy.
    """
    if score_percent is not None and score_percent < EVALUATION_FAIL_PERCENT:
        return (
            "Critical",
            "Failed evaluation",
            "Immediate intervention required",
            "danger",
        )
    if (
        score_percent is not None
        and score_percent < QUIZ_LOW_SCORE_PERCENT
        and attendance_percent is not None
        and attendance_percent < POOR_ATTENDANCE_PERCENT
    ):
        return (
            "High",
            "Low evaluation score and poor attendance",
            "Schedule targeted support",
            "danger",
        )
    if (
        (score_percent is not None and score_percent < QUIZ_LOW_SCORE_PERCENT)
        or (
            attendance_percent is not None
            and attendance_percent < POOR_ATTENDANCE_PERCENT
        )
    ):
        return (
            "Medium",
            "Low quiz score or attendance engagement",
            "Monitor and review progress",
            "warning",
        )
    return ("Low", "On track", "Continue regular monitoring", "success")
