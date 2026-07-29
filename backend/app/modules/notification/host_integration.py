from __future__ import annotations
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from jose import JWTError
from sqlalchemy import Integer, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import Base, SessionLocal, get_db
from app.modules.users.models import User

USER_TABLE_NAME = "users"


def normalize_user_id(user_id: Any) -> int:
    if isinstance(user_id, UUID):
        return int(user_id)
    return int(user_id)


def resolve_websocket_user(token: str, db: Session) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        from app.core.security import decode_token
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        sub = payload.get("sub")
        if sub is None:
            raise credentials_exception
        user_id = int(sub)
    except JWTError:
        raise credentials_exception

    user = db.execute(
        select(User)
        .options(joinedload(User.student))
        .options(joinedload(User.teacher))
        .options(selectinload(User.roles))
        .where(User.id == user_id)
    ).unique().scalar_one_or_none()
    if user is None or not bool(getattr(user, "is_active", True)):
        raise credentials_exception
    return user


from app.core.deps import get_current_user, require_role  # noqa: E402

require_roles = require_role


def user_id_column_type():
    return Integer()


__all__ = [
    "Base",
    "USER_TABLE_NAME",
    "User",
    "user_id_column_type",
    "resolve_websocket_user",
    "normalize_user_id",
    "get_db",
    "get_current_user",
    "require_roles",
    "SessionLocal",
]
