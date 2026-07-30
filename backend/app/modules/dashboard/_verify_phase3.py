"""Pure/read-only verification for Phase 3 dynamic-alert policy."""

import app.main  # establish application model import order
import inspect
from datetime import date, datetime, timedelta, timezone

from app.modules.dashboard.common import (
    _alert_id,
    get_alert_capability_section,
)
from app.modules.dashboard.policy import (
    configured_pass_percentage,
    course_schedule_delay_days,
    duration_excess_percentage,
    failure_percentage,
    is_class_failure_alert,
    is_duration_overrun,
    score_percentage,
)
from app.modules.dashboard.sat import get_sat_feedback_trends_item
from app.modules.dashboard.instructor import (
    get_feedback_speed,
    get_upcoming_flight_bookings_item,
)
from app.modules.dashboard.leadership import (
    get_flight_simulator_hours_section,
)


checks = 0


def check(condition: bool, message: str) -> None:
    global checks
    if not condition:
        raise AssertionError(message)
    checks += 1


# Quiz normalization and threshold semantics.
check(score_percentage(8, 10) == 80, "score above threshold")
check(score_percentage(7, 10) == 70, "score equal threshold")
check(score_percentage(6, 10) == 60, "score below threshold")
check(score_percentage(40, 50) == 80, "different maximum scores")
check(score_percentage(1, 0) is None, "missing maximum score")
check(
    configured_pass_percentage(
        pass_mark=7, configured_maximum=10, pass_percentage=0
    )
    == 70,
    "configured mark/max threshold",
)
check(
    configured_pass_percentage(
        pass_mark=0, configured_maximum=0, pass_percentage=65
    )
    == 65,
    "configured percentage threshold",
)

# Strict class-failure boundary and duplicate-safe input semantics.
check(failure_percentage(0, 0) == 0, "empty cohort")
check(not is_class_failure_alert(10, 0), "zero percent")
check(not is_class_failure_alert(10, 4), "exactly forty percent")
check(is_class_failure_alert(10, 5), "more than forty percent")
check(not is_class_failure_alert(5, 2), "distinct latest-attempt inputs")

# Duration policy remains testable even though the alert is unsupported because
# generic sessions cannot be joined to a course lesson.
start = datetime(2026, 7, 29, 8, tzinfo=timezone.utc)
planned_end = start + timedelta(hours=1)
check(
    duration_excess_percentage(
        planned_start=start,
        planned_end=planned_end,
        actual_start=start,
        actual_end=None,
    )
    is None,
    "incomplete duration",
)
check(
    not is_duration_overrun(
        duration_excess_percentage(
            planned_start=start,
            planned_end=planned_end,
            actual_start=start,
            actual_end=start + timedelta(minutes=66),
        )
    ),
    "below duration threshold",
)
check(
    not is_duration_overrun(
        duration_excess_percentage(
            planned_start=start,
            planned_end=planned_end,
            actual_start=start,
            actual_end=start + timedelta(minutes=72),
        )
    ),
    "exact duration threshold",
)
check(
    is_duration_overrun(
        duration_excess_percentage(
            planned_start=start,
            planned_end=planned_end,
            actual_start=start,
            actual_end=start + timedelta(minutes=73),
        )
    ),
    "above duration threshold",
)
try:
    duration_excess_percentage(
        planned_start=start.replace(tzinfo=None),
        planned_end=planned_end,
        actual_start=start,
        actual_end=start + timedelta(minutes=90),
    )
except ValueError:
    checks += 1
else:
    raise AssertionError("naive duration input must be rejected")

# Approved-instance schedule delay.
today = date(2026, 7, 29)
check(
    course_schedule_delay_days(
        status="approved", planned_end=today + timedelta(days=1), today=today
    )
    is None,
    "future planned end",
)
check(
    course_schedule_delay_days(
        status="approved", planned_end=today, today=today
    )
    is None,
    "planned end today",
)
check(
    course_schedule_delay_days(
        status="approved", planned_end=today - timedelta(days=2), today=today
    )
    == 2,
    "approved instance past planned end",
)
check(
    course_schedule_delay_days(
        status="draft", planned_end=today - timedelta(days=2), today=today
    )
    is None,
    "draft excluded",
)
check(
    course_schedule_delay_days(
        status="stopped", planned_end=today - timedelta(days=2), today=today
    )
    is None,
    "stopped excluded",
)

# Semantic integrity and alert availability.
feedback = get_sat_feedback_trends_item(None)
check(feedback["value"] == "N/A", "feedback empty state")
check("support tickets are not" in feedback["helperText"], "ticket semantics")
check(
    '"label": "Support ticket resolution duration"'
    in inspect.getsource(get_feedback_speed),
    "support metric is not labelled feedback",
)
check(
    '"label": "Upcoming scheduled sessions"'
    in inspect.getsource(get_upcoming_flight_bookings_item),
    "generic sessions are not labelled flight bookings",
)
check(
    '"label": "Session hrs planned vs completed"'
    in inspect.getsource(get_flight_simulator_hours_section),
    "generic hours are not labelled flight/simulator",
)
capabilities = get_alert_capability_section()["items"]
check(len(capabilities) == 9, "all required alert capabilities documented")
check(
    [item["id"] for item in capabilities]
    == [f"alert-capability-{number:03d}" for number in range(1, 10)],
    "stable alert capability codes",
)
check(_alert_id("alert-002", "7-4-3") == "alert-002-7-4-3", "stable alert ID")
check(
    len({_alert_id("alert-002", "7-4-3"), _alert_id("alert-002", "7-4-3")})
    == 1,
    "request-time duplicate prevention key",
)
unsupported = {
    item["id"]
    for item in capabilities
    if item["value"] == "Unsupported"
}
check("alert-capability-001" in unsupported, "flight evaluation unsupported")
check("alert-capability-004" in unsupported, "duration alert unsupported")
check("alert-capability-006" in unsupported, "flight booking unsupported")
check("alert-capability-007" in unsupported, "external instructor unsupported")
check("alert-capability-008" in unsupported, "export readiness unsupported")

print(f"dashboard Phase 3 verification: {checks} checks passed")
