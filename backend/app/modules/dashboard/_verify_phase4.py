"""Read-only final contract, scope, determinism, and transfer checks."""

import app.main  # establish application model import order
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import select

from app.core.database import SessionLocal
from app.modules.dashboard.common import get_alert_capability_section
from app.modules.dashboard.policy import (
    DASHBOARD_ALERT_LIMIT,
    DASHBOARD_DETAIL_LIMIT,
    failure_percentage,
    score_percentage,
)
from app.modules.dashboard.router import (
    get_instructor,
    get_leadership,
    get_sat,
    get_student,
)
from app.modules.dashboard.schemas import (
    AlertItem,
    DashboardFilterState,
    DashboardResponse,
)
from app.modules.users.models import User


checks = 0


def check(condition: bool, message: str) -> None:
    global checks
    if not condition:
        raise AssertionError(message)
    checks += 1


def without_generated_times(payload: dict) -> dict:
    stable = deepcopy(payload)
    for alert in stable["dashboardInfo"]["alerts"]:
        alert.pop("generatedTimestamp", None)
        alert.pop("time", None)
    return stable


# Strict alert and response contracts.
sample_alert = AlertItem(
    id="alert-002-1-2-3",
    code="ALERT-002",
    title="Low score",
    description="Observed below configured threshold",
    severity="high",
    dashboardRole="student",
    entityType="quiz-attempt",
    entityIdentifier="7",
    currentValue="60%",
    threshold="70%",
    generatedTimestamp=datetime.now(timezone.utc).isoformat(),
    recommendedAction="Review lesson",
    time="10:00",
    tone="danger",
)
check(sample_alert.code == "ALERT-002", "supported alert validates")
check(sample_alert.generatedTimestamp.endswith("+00:00"), "alert timestamp is aware UTC")
try:
    AlertItem(**sample_alert.model_dump(), internal_model_state="leak")
except ValidationError:
    checks += 1
else:
    raise AssertionError("unexpected alert fields must be rejected")

capabilities = get_alert_capability_section()["items"]
check(len(capabilities) == 9, "all alert capabilities validate")
check(
    next(item for item in capabilities if item["id"] == "alert-capability-009")[
        "value"
    ]
    == "Partially supported",
    "partial schedule-delay capability",
)
check(
    all(item["value"] != "0" for item in capabilities),
    "unsupported capabilities are not fake zeroes",
)

# Percentage boundaries.
check(failure_percentage(0, 0) == 0, "empty denominator safe")
check(failure_percentage(10, 0) == 0, "zero numerator")
check(failure_percentage(10, 10) == 100, "full numerator")
check(failure_percentage(10, 11) > 100, "invalid duplicate input remains detectable")
check(score_percentage(8, 10) == score_percentage(40, 50) == 80, "mixed maxima")

# Bounds are explicit and alerts fit within the detail ceiling.
check(0 < DASHBOARD_ALERT_LIMIT <= DASHBOARD_DETAIL_LIMIT, "alert result bound")
check(DASHBOARD_DETAIL_LIMIT == 50, "stable dashboard detail bound")

with SessionLocal() as db:
    user = db.execute(
        select(User).where(User.profile.has()).order_by(User.id).limit(1)
    ).scalar_one()
    role_functions = {
        "leadership": get_leadership,
        "sat": get_sat,
        "instructor": get_instructor,
        "student": get_student,
    }
    validated: dict[str, dict] = {}
    for role, function in role_functions.items():
        params = DashboardFilterState(report_type=role, dateRange="all")
        first = function(db, user, params)
        second = function(db, user, params)
        DashboardResponse.model_validate(first)
        DashboardResponse.model_validate(second)
        check(
            without_generated_times(first) == without_generated_times(second),
            f"{role} response ordering is deterministic",
        )
        check(
            len(first["dashboardInfo"]["alerts"]) <= DASHBOARD_ALERT_LIMIT,
            f"{role} alerts bounded",
        )
        validated[role] = first

    stale = get_leadership(
        db,
        user,
        DashboardFilterState(
            report_type="leadership",
            course="No such course",
            courseVersion="v999",
            courseInstance="999999",
            dateRange="all",
        ),
    )
    DashboardResponse.model_validate(stale)
    check(stale["filters"]["courseInstance"] == "999999", "stale combination safe")

    student = get_student(
        db,
        user,
        DashboardFilterState(report_type="student", student="999999", dateRange="all"),
    )
    check(
        student["filters"]["student"] == str(user.profile.id),
        "student identity override replaced",
    )
    check(
        all(
            alert.get("student") in (None, user.profile.first_name)
            for alert in student["dashboardInfo"]["alerts"]
        ),
        "student alerts contain no peers",
    )
    student_options = next(
        option
        for option in student["filterOptions"]
        if option["key"] == "student"
    )["options"]
    check(
        all(option["value"] == str(user.profile.id) for option in student_options),
        "student options self-scoped",
    )

    instructor = get_instructor(
        db,
        user,
        DashboardFilterState(
            report_type="instructor", instructor="999999", dateRange="all"
        ),
    )
    check(
        instructor["filters"]["instructor"] == str(user.profile.id),
        "instructor identity override replaced",
    )
    instructor_options = next(
        option
        for option in instructor["filterOptions"]
        if option["key"] == "instructor"
    )["options"]
    check(
        all(option["value"] == str(user.profile.id) for option in instructor_options),
        "instructor options self-scoped",
    )

    for role in ("leadership", "sat", "instructor", "student"):
        options = validated[role]["filterOptions"]
        for option_group in options:
            values = [
                (option["label"] or "", option["value"])
                for option in option_group["options"]
                if option["value"] != "all"
            ]
            check(
                len(values) == len(set(values)),
                f"{role} {option_group['key']} options contain no duplicates",
            )

# Source-level timezone and semantic safeguards.
dashboard_dir = Path(__file__).resolve().parent
python_source = "\n".join(
    path.read_text(encoding="utf-8")
    for path in sorted(dashboard_dir.glob("*.py"))
    if path.name != "_verify_phase4.py"
)
check("datetime.utcnow" not in python_source, "no naive utcnow")
check(
    '"label": "Flight/simulator' not in python_source,
    "generic sessions not labelled flight/simulator",
)
check(
    '"label": "Material effectiveness"' not in python_source,
    "material completion not labelled effectiveness",
)
check(
    '"label": "Student pass/fail rate"' not in python_source,
    "attempt rate not labelled student rate",
)
check(
    '"label": "Course completion rate"' not in python_source,
    "ended instances not labelled completed courses",
)
check(
    "Avg ticket response time change" not in python_source,
    "support tickets not labelled feedback",
)

frontend_store = (
    dashboard_dir.parents[3]
    / "frontend"
    / "src"
    / "modules"
    / "dashboard-scheduling"
    / "dashboard"
    / "store.ts"
)
store_source = frontend_store.read_text(encoding="utf-8")
check("filterChildren" in store_source, "frontend parent-child reset retained")
check("void getDashboardInfo(next)" in store_source, "reset state submitted atomically")

print(f"dashboard Phase 4 verification: {checks} checks passed")
