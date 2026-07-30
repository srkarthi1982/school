"""Read-only structural checks for Phase 2 dashboard hierarchy scoping.

Run from backend with:
    PYTHONPATH=. .venv/Scripts/python.exe app/modules/dashboard/_verify_phase2.py
"""

import app.main  # establish the application's model import order
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.modules.course.models import CourseInstance
from app.modules.dashboard.query import apply_course_instance_scope
from app.modules.dashboard.schemas import DashboardFilterState


def sql_for(**updates: str) -> str:
    params = DashboardFilterState(**updates)
    statement = apply_course_instance_scope(
        select(CourseInstance.id).select_from(CourseInstance), params
    )
    return str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).lower()


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


unfiltered = sql_for()
check("course_masters" not in unfiltered, "no-filter query must remain broad")

course_only = sql_for(course="Commercial Pilot Ground School")
check("lower(course_masters.title)" in course_only, "course title scope")
check("ctp_version =" not in course_only, "course includes every version")
check("course_instances.id =" not in course_only, "course includes every instance")

version_only = sql_for(courseVersion="v2")
check("ctp_version = 'v2'" in version_only, "version scope")
check("course_instances.id =" not in version_only, "version includes every instance")

course_version = sql_for(course="Commercial Pilot Ground School", courseVersion="v2")
check(
    "lower(course_masters.title)" in course_version
    and "ctp_version = 'v2'" in course_version,
    "course and version combine with AND",
)

course_instance = sql_for(course="Commercial Pilot Ground School", courseInstance="7")
check(
    "lower(course_masters.title)" in course_instance
    and "course_instances.id = 7" in course_instance,
    "course and instance combine with AND",
)

version_instance = sql_for(courseVersion="v2", courseInstance="7")
check(
    "ctp_version = 'v2'" in version_instance
    and "course_instances.id = 7" in version_instance,
    "version and instance combine with AND",
)

stale = sql_for(course="Nonexistent", courseVersion="v999", courseInstance="999999")
check(
    all(
        fragment in stale
        for fragment in (
            "lower(course_masters.title)",
            "ctp_version = 'v999'",
            "course_instances.id = 999999",
        )
    ),
    "stale combinations must retain every constraint and yield no matches",
)

try:
    DashboardFilterState(courseInstance="invalid")
except ValueError:
    pass
else:
    raise AssertionError("invalid instance IDs must fail validation")

print("dashboard Phase 2 hierarchy verification: 8 checks passed")
