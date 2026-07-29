from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.modules.chat.common.services import serialize_user_reference
from app.modules.chat.host_integration import User, normalize_user_id


def search_students_for_teacher(db: Session, current_user_id: Any, q: str, limit: int):
    from app.modules.users.models import Role
    from app.modules.profile.models import Profile

    filters = [User.is_active.is_(True)]
    stmt = select(User).join(User.profile).options(selectinload(User.profile)).join(User.roles).filter(Role.name == "student")

    if q:
        pattern = f"%{q.lower()}%"
        filters.append(
            or_(
                Profile.first_name.ilike(pattern),
                Profile.middle_name.ilike(pattern),
                Profile.last_name.ilike(pattern),
                User.username.ilike(pattern),
                Profile.email.ilike(pattern),
            )
        )

    stmt = stmt.where(*filters).order_by(Profile.first_name.asc(), Profile.last_name.asc()).limit(limit)
    result = db.execute(stmt)
    users = result.scalars().all()
    return [serialize_user_reference(user) for user in users]
