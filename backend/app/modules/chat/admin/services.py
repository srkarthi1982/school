from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.modules.chat.common.services import serialize_user_reference
from app.modules.chat.host_integration import User, normalize_user_id
from app.modules.users.models import Role


def admin_search_users(db: Session, q: str, limit: int, role: str | None = None, current_user_id: int | None = None):
    from app.modules.profile.models import Profile

    filters = [User.is_active.is_(True)]
    stmt = select(User).join(User.profile).options(selectinload(User.profile))

    if current_user_id is not None:
        normalized_current = normalize_user_id(current_user_id)
        filters.append(User.id != normalized_current)

    if role:
        stmt = stmt.join(User.roles)
        filters.append(Role.name == role)

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
    users = result.scalars().all()
    return [serialize_user_reference(user) for user in users]
