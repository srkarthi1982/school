from __future__ import annotations
from typing import Any
from uuid import UUID

from fastapi import Depends, HTTPException, Query, WebSocket, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import select, Integer
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import Base, get_db, SessionLocal
from app.modules.users.models import User

USER_TABLE_NAME = "users"
USER_ID_KIND = "INTEGER"
USER_ID_MAX_LENGTH = 255

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    scheme_name="oauth2",
)

optional_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    scheme_name="oauth2",
    auto_error=False,
)


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


def get_current_user_for_file(
    token: str | None = Query(None),
    header_token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    actual_token = header_token or token
    if not actual_token:
        raise credentials_exception
    try:
        from app.core.security import decode_token
        payload = decode_token(actual_token)
        if payload.get("type") != "access":
            raise credentials_exception
        sub = payload.get("sub")
        if sub is None:
            raise credentials_exception
        user_id = int(sub)
    except (JWTError, ValueError):
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


# Re-export centralized auth utilities so chat modules stay stable.
from app.core.deps import get_current_user, require_role  # noqa: E402

require_roles = require_role


def user_id_column_type():
    return Integer()


__all__ = [
    "Base",
    "USER_TABLE_NAME",
    "USER_ID_KIND",
    "USER_ID_MAX_LENGTH",
    "User",
    "user_id_column_type",
    "resolve_websocket_user",
    "normalize_user_id",
    "get_db",
    "get_current_user",
    "get_current_user_for_file",
    "require_roles",
    "SessionLocal",
    "oauth2_scheme",
    "optional_oauth2_scheme",
]
