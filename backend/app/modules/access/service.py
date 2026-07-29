from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog
from app.modules.users.models import Role


def resolve_roles(db: Session, role_names: list[str]) -> list[Role]:
    """Fetch roles by name and raise ValueError if any are missing."""
    if not role_names:
        return []
    roles = db.query(Role).filter(Role.name.in_(role_names)).all()
    found = {r.name for r in roles}
    missing = set(role_names) - found
    if missing:
        raise ValueError(f"Unknown roles: {', '.join(sorted(missing))}")
    return roles


def log_user_role_change(
    db: Session,
    *,
    user_id: int,
    old_roles: list[str],
    new_roles: list[str],
    acting_user_id: int | None = None,
) -> None:
    db.add(
        AuditLog(
            table_name="user_roles",
            row_id=str(user_id),
            operation="UPDATE",
            user_id=acting_user_id,
            timestamp=datetime.now(timezone.utc),
            before_data={"roles": old_roles},
            after_data={"roles": new_roles},
            changed_fields=["roles"],
        )
    )


def log_role_permission_change(
    db: Session,
    *,
    role_id: int,
    old_codes: list[str],
    new_codes: list[str],
    acting_user_id: int | None = None,
) -> None:
    db.add(
        AuditLog(
            table_name="role_permissions",
            row_id=str(role_id),
            operation="UPDATE",
            user_id=acting_user_id,
            timestamp=datetime.now(timezone.utc),
            before_data={"permissions": old_codes},
            after_data={"permissions": new_codes},
            changed_fields=["permissions"],
        )
    )
