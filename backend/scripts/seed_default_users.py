#!/usr/bin/env python3
"""Seed default users for local development / first-run setup.

Creates a fixed set of users (admin / teacher / student) with hashed
passwords and the matching system role assigned. Safe to run repeatedly:
existing usernames are skipped, so it never duplicates or overwrites data.

Run from anywhere with the backend's virtualenv interpreter, e.g.:

    backend/.venv/Scripts/python.exe backend/scripts/seed_default_users.py  # Windows
    backend/.venv/bin/python backend/scripts/seed_default_users.py          # Unix
"""

import logging
import os
import sys
from pathlib import Path

# Make the backend's ``app`` package importable and run from its directory so
# the app's relative ``.env`` (Settings env_file) resolves the same way it does
# when the server runs from backend/.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
os.chdir(_BACKEND_DIR)


_VENV_DIR = _BACKEND_DIR / ".venv"


def _ensure_backend_venv() -> None:
    """Fail early with an actionable message if the backend venv isn't in use.

    The app's dependencies live in backend/.venv. Launching with a plain
    ``python`` resolves some libs from the global site-packages but later
    crashes deep inside import_all_models() with a confusing
    ModuleNotFoundError. Detect the wrong interpreter up front instead.
    """
    if not _VENV_DIR.exists():
        # No project venv (e.g. deps installed system-wide / in a container) —
        # nothing to enforce.
        return

    # sys.prefix points at the active environment's root; for the backend venv
    # interpreter (whether "activated" or invoked directly) it equals _VENV_DIR.
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

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.modules import import_all_models
from app.modules.users.models import AuthProvider, Role, User
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# (username, password, role_name)
DEFAULT_USERS: list[tuple[str, str, str]] = [
    ("admin", "admin123", "admin"),
    ("student", "student123", "student"),
    ("student1", "student123", "student"),
    ("student2", "student123", "student"),
    ("student3", "student123", "student"),
    ("teacher", "teacher123", "teacher"),
    ("teacher1", "teacher123", "teacher"),
    ("teacher2", "teacher123", "teacher"),
    ("teacher3", "teacher123", "teacher"),
]


def seed_users(db: Session) -> None:
    # Cache roles by name so missing roles are reported clearly.
    roles_by_name = {r.name: r for r in db.query(Role).all()}

    created = 0
    skipped = 0
    for username, password, role_name in DEFAULT_USERS:
        if db.query(User).filter(User.username == username).first():
            logger.info("User already exists, skipping: %s", username)
            skipped += 1
            continue

        role = roles_by_name.get(role_name)
        if role is None:
            raise ValueError(
                f"Role '{role_name}' not found. Run database migrations first "
                "(alembic upgrade head)."
            )

        user = User(
            username=username,
            hashed_password=hash_password(password),
            auth_provider=AuthProvider.EMAIL.value,
            is_active=True,
            is_external=False,
        )
        # full_name / email setters lazily create the related Profile row,
        # whose first_name and email columns are NOT NULL.
        user.full_name = username.capitalize()
        user.email = f"{username}@example.com"
        user.roles = [role]

        db.add(user)
        created += 1
        logger.info("Created user: %s (role=%s)", username, role_name)

    db.commit()
    logger.info("Seed complete: %d created, %d skipped", created, skipped)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    # Resolve all string-based relationship references before touching the ORM.
    import_all_models()
    db = SessionLocal()
    try:
        seed_users(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
