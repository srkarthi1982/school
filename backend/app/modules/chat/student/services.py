from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.modules.chat.common.services import (
    classmate_only_profile_filter,
    serialize_user_reference,
)
from app.modules.chat.host_integration import User, normalize_user_id


def search_student_contacts(db: Session, current_user: Any, q: str, limit: int, role: str | None = None):
    from app.modules.users.models import Role
    from app.modules.profile.models import Profile

    filters = [User.is_active.is_(True)]
    normalized_current = normalize_user_id(current_user.id)
    filters.append(User.id != normalized_current)

    stmt = select(User).join(User.profile).options(selectinload(User.profile))
    if role:
        stmt = stmt.join(User.roles)
        filters.append(Role.name == role)

    # Plain students may only start chats with classmates: users co-enrolled in
    # the same course instance(s). Admins/teachers (and anyone else routed here)
    # keep the full directory.
    classmate_filter = classmate_only_profile_filter(db, current_user)
    if classmate_filter is not None:
        filters.append(classmate_filter)

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

    stmt = (
        stmt.where(*filters)
        .order_by(Profile.first_name.asc(), Profile.last_name.asc())
        .limit(limit)
    )
    result = db.execute(stmt)
    users = result.unique().scalars().all()
    return [serialize_user_reference(user) for user in users]
