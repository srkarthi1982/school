"""Read-only checks for dashboard policy calculations and identity scoping.

Run from backend with:
    PYTHONPATH=. .venv/Scripts/python.exe app/modules/dashboard/_verify_policy.py
"""

import app.main  # establish the application's model import order
from datetime import datetime, timedelta, timezone

from app.modules.dashboard.policy import (
    classify_student_risk,
    failure_percentage,
    is_class_failure_alert,
    scope_role_filters,
    temporal_position,
    is_planned_end_delayed,
)
from app.modules.dashboard.schemas import DashboardFilterState
from app.modules.dashboard.instructor import (
    get_external_instructor_coordination_alerts_item,
)
from app.modules.dashboard.kpis import get_api_export_kpis


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


# Failure calculation boundaries and duplicate-safe aggregate semantics.
check(failure_percentage(0, 0) == 0, "empty class")
check(not is_class_failure_alert(10, 0), "0% must not alert")
check(not is_class_failure_alert(10, 4), "exactly 40% must not alert")
check(is_class_failure_alert(10, 5), "more than 40% must alert")
check(failure_percentage(5, 2) == 40, "distinct aggregate inputs")

# Supported risk cases. Mandatory-training logic is intentionally not claimed.
check(classify_student_risk(85, 95)[0] == "Low", "low risk")
check(classify_student_risk(65, 90)[0] == "Medium", "medium risk")
check(classify_student_risk(65, 60)[0] == "High", "high risk")
check(classify_student_risk(45, 95)[0] == "Critical", "failed evaluation")

# A caller-controlled identity must never override authenticated identity.
student = scope_role_filters(
    DashboardFilterState(report_type="student", student="999"),
    role="student",
    profile_id=7,
)
check(student.student == "7", "student identity override")
instructor = scope_role_filters(
    DashboardFilterState(report_type="instructor", instructor="999"),
    role="instructor",
    profile_id=11,
)
check(instructor.instructor == "11", "instructor identity override")
check(
    get_external_instructor_coordination_alerts_item(None)["value"] == "N/A",
    "external instructor unavailable state",
)
check(
    get_api_export_kpis(None, None)["value"] == "N/A",
    "API export unavailable state",
)

reference = datetime(2026, 7, 29, 12, tzinfo=timezone.utc)
check(
    temporal_position(reference - timedelta(seconds=1), now=reference) == "past",
    "aware past instant",
)
check(temporal_position(reference, now=reference) == "now", "aware boundary")
check(
    temporal_position(reference + timedelta(seconds=1), now=reference) == "future",
    "aware future instant",
)
check(
    is_planned_end_delayed(
        planned_end=reference,
        actual_end=None,
        now=reference + timedelta(minutes=1),
    ),
    "in-progress session beyond planned end",
)
check(
    not is_planned_end_delayed(
        planned_end=reference,
        actual_end=reference - timedelta(minutes=1),
        now=reference + timedelta(minutes=1),
    ),
    "session completed before planned end",
)
try:
    temporal_position(reference.replace(tzinfo=None), now=reference)
except ValueError:
    pass
else:
    raise AssertionError("naive datetime must be rejected")

print("dashboard policy verification: 19 checks passed")
