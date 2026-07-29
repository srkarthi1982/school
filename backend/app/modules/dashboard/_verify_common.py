"""Compile-check every common.py query across all 4 report types + full filters.

Run from backend/ with: PYTHONPATH=. .venv/Scripts/python.exe app/modules/dashboard/_verify_common.py
"""
import sys
import app.main  # establish import order

from app.modules.dashboard.common import (
    get_alerts, get_week_lessons, get_risk_statuses,
    get_pending_actions, get_export_readiness,
)
from app.modules.dashboard.schemas import DashboardFilterState


class FakeResult:
    def __init__(self, value=0):
        self._value = value
    def scalar(self): return self._value
    def scalars(self): return self
    def all(self): return []
    def first(self): return None


class FakeDB:
    def execute(self, stmt):
        try:
            str(stmt.compile(compile_kwargs={"literal_binds": False}))
        except Exception as e:
            raise RuntimeError(f"Compile failed: {e}") from e
        return FakeResult()


def make_params(report_type, **overrides):
    base = dict(
        report_type=report_type, course="all", courseVersion="all",
        courseInstance="all", student="all", instructor="all",
        dateRange="24h", lesson="all", trainingType="all",
        competency="all", aircraftSimulator="all", material="all",
        evaluationType="all",
    )
    base.update(overrides)
    return DashboardFilterState(**base)


db = FakeDB()
full_filters = dict(
    courseInstance="10", courseVersion="v1", instructor="5",
    lesson="3", evaluationType="theory", material="00000000-0000-0000-0000-000000000001",
    dateRange="7d", student="7",
)

fns = [get_alerts, get_week_lessons, get_risk_statuses, get_pending_actions, get_export_readiness]
errors = 0
for report_type in ("leadership", "sat", "instructor", "student"):
    print(f"\n=== report_type={report_type} (all filters set) ===")
    params = make_params(report_type, **full_filters)
    for fn in fns:
        name = fn.__name__
        try:
            result = fn(db, params)
            n = len(result) if isinstance(result, list) else "dict"
            print(f"  OK   {name} -> {n}")
        except Exception as e:
            errors += 1
            print(f"  FAIL {name}: {type(e).__name__}: {e}")

# Also test default filters (no scoping)
print("\n=== report_type=student (default filters) ===")
params = make_params("student")
for fn in fns:
    try:
        fn(db, params)
        print(f"  OK   {fn.__name__}")
    except Exception as e:
        errors += 1
        print(f"  FAIL {fn.__name__}: {type(e).__name__}: {e}")

print(f"\n{errors} failure(s)")
sys.exit(1 if errors else 0)
