from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.pat.models import PersonalAccessToken

TOKEN_PREFIX = "jai_pat_"
# last_used_at is best-effort telemetry; avoid a write on every request.
LAST_USED_UPDATE_INTERVAL = timedelta(minutes=5)


def _hash_token(token: str) -> str:
    # SHA-256, not bcrypt: tokens are high-entropy (unguessable), and lookup
    # must be a single indexed query by hash.
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_pat(db: Session, user_id: int, name: str, expires_in_days: int) -> tuple[PersonalAccessToken, str]:
    """Create a token for the user. Returns (record, plaintext) — the
    plaintext is never recoverable afterwards."""
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    record = PersonalAccessToken(
        user_id=user_id,
        name=name.strip(),
        token_prefix=token[:16],
        token_hash=_hash_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=expires_in_days),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record, token


def list_pats(db: Session, user_id: int) -> list[PersonalAccessToken]:
    return list(
        db.execute(
            select(PersonalAccessToken)
            .where(PersonalAccessToken.user_id == user_id)
            .order_by(PersonalAccessToken.created_at.desc())
        ).scalars().all()
    )


def revoke_pat(db: Session, user_id: int, token_id: UUID) -> PersonalAccessToken:
    record = db.get(PersonalAccessToken, token_id)
    if record is None or record.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    if record.revoked_at is None:
        record.revoked_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(record)
    return record


def resolve_pat_user(db: Session, token: str):
    """Return the active User a valid token belongs to, else None."""
    from app.modules.users.models import Role, User

    if not token.startswith(TOKEN_PREFIX):
        return None
    record = db.execute(
        select(PersonalAccessToken).where(PersonalAccessToken.token_hash == _hash_token(token))
    ).scalar_one_or_none()
    if record is None or record.revoked_at is not None:
        return None
    now = datetime.now(timezone.utc)
    if record.expires_at <= now:
        return None

    user = db.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(Role.permissions))
        .options(selectinload(User.profile))
        .where(User.id == record.user_id)
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        return None

    if record.last_used_at is None or now - record.last_used_at >= LAST_USED_UPDATE_INTERVAL:
        record.last_used_at = now
        db.commit()
    return user
