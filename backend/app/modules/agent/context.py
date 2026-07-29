from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session


@dataclass
class UserContext:
    """Identity and authorization context of the user the agent acts for.

    Every tool receives this and must scope its queries to it — the agent has
    no identity of its own and never queries beyond what this user may see.
    """

    user_id: int
    username: str
    full_name: str | None
    roles: list[str]
    permissions: set[str] = field(default_factory=set)
    profile_id: int | None = None
    db: Session | None = None
    # Document scope of an agent_doc conversation. Set by the agent service
    # from the conversation row (never by the model), and enforced by
    # search_materials so retrieval stays inside this one document.
    doc_source_type: str | None = None  # 'library' | 'course_material'
    doc_id: str | None = None
    doc_title: str | None = None

    def has_permission(self, *codes: str) -> bool:
        return bool(self.permissions & {str(c) for c in codes})


def build_user_context(db: Session, user) -> UserContext:
    from app.core.deps import get_user_permission_codes

    profile = getattr(user, "profile", None)
    return UserContext(
        user_id=user.id,
        username=user.username,
        full_name=user.full_name,
        roles=list(user.role_names),
        permissions=get_user_permission_codes(user, db),
        profile_id=profile.id if profile is not None else None,
        db=db,
    )
