#!/usr/bin/env python3
"""Seed default attendance statuses.

Populates the ``attendance_status`` table with the standard status options
(present, absent, late, excused, simulation, flying) along with their display
names and hex color codes. Safe to run repeatedly — existing codes are skipped.

Run with the backend virtualenv interpreter:

    backend/.venv/Scripts/python.exe backend/scripts/seed_attendance_statuses.py  # Windows
    backend/.venv/bin/python backend/scripts/seed_attendance_statuses.py         # Unix
"""

import logging
import os
import sys
from pathlib import Path

# Make the backend's ``app`` package importable and run from its directory so
# the app's relative ``.env`` resolves the same way it does when the server runs.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
os.chdir(_BACKEND_DIR)


_VENV_DIR = _BACKEND_DIR / ".venv"


def _ensure_backend_venv() -> None:
    """Fail early if the backend venv isn't in use."""
    if not _VENV_DIR.exists():
        return

    if Path(sys.prefix).resolve() == _VENV_DIR.resolve():
        return

    activate = (
        _VENV_DIR / "Scripts" / "Activate.ps1"
        if os.name == "nt"
        else f"source {_VENV_DIR / 'bin' / 'activate'}"
    )
    venv_python = _VENV_DIR / ("Scripts" if os.name == "nt" else "bin") / "python"
    sys.exit(
        "Virtual environment is not active.\n"
        f"Activate the backend virtualenv first, then re-run:\n"
        f"    {activate}\n"
        "Or run it directly with the venv interpreter:\n"
        f"    {venv_python} {Path(__file__).name}"
    )


_ensure_backend_venv()

from app.modules.attendance_status.models import AttendanceStatus
from app.core.database import SessionLocal
from app.modules import import_all_models
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

ATTENDANCE_STATUSES: list[dict] = [
    {"code": "present", "name": "Present", "color": "#51f50a"},
    {"code": "absent", "name": "Absent", "color": "#f6041c"},
    {"code": "late", "name": "Late", "color": "#f4f80d"},
    {"code": "excused", "name": "Excused", "color": "#f4f89d"},
    {"code": "simulation", "name": "Simulation", "color": "#d70ae6"},
    {"code": "flying", "name": "Flying", "color": "#110de7"},
]


def seed_attendance_statuses(db: Session) -> None:
    imported_codes = {s["code"] for s in db.query(AttendanceStatus.code).all()}

    created = 0
    skipped = 0
    for status_data in ATTENDANCE_STATUSES:
        if status_data["code"] in imported_codes:
            logger.info("Status already exists, skipping: %s", status_data["code"])
            skipped += 1
            continue

        status = AttendanceStatus(**status_data)
        db.add(status)
        created += 1
        logger.info("Created attendance status: %s (%s)", status_data["name"], status_data["code"])

    db.commit()
    logger.info("Seed complete: %d created, %d skipped", created, skipped)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    import_all_models()
    db = SessionLocal()
    try:
        seed_attendance_statuses(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
