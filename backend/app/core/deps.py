import logging
from typing import TYPE_CHECKING

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session, selectinload

from app.core.context import current_user_id_var
from app.core.database import get_db
from app.core.security import decode_token

if TYPE_CHECKING:
    from app.core.permissions import PermissionCode

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    scheme_name="oauth2",
)

# ---------------------------------------------------------------------------
# In-memory permission cache
# ---------------------------------------------------------------------------
_role_permissions_cache: dict[str, set[str]] = {}
_cache_loaded = False


def _load_permission_cache(db: Session) -> None:
    """Load role-permission mappings into memory."""
    global _cache_loaded, _role_permissions_cache
    from app.modules.users.models import Role

    roles = db.query(Role).all()
    _role_permissions_cache = {
        r.name: {p.code for p in r.permissions} for r in roles
    }
    _cache_loaded = True
    logger.debug("Permission cache loaded with %s roles", len(_role_permissions_cache))


def invalidate_permission_cache() -> None:
    """Call after mutating role permissions via admin API."""
    global _cache_loaded
    _cache_loaded = False
    logger.info("Permission cache invalidated")


def _ensure_cache(db: Session) -> dict[str, set[str]]:
    if not _cache_loaded:
        _load_permission_cache(db)
    return _role_permissions_cache


# ---------------------------------------------------------------------------
# Current user
# ---------------------------------------------------------------------------
def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> "User":
    from app.modules.users.models import Role, User

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        sub = payload.get("sub")
        if sub is None:
            raise credentials_exception
        user_id = int(sub)
    except JWTError:
        logger.warning("Invalid access token")
        raise credentials_exception

    user = (
        db.query(User)
        .options(selectinload(User.roles).selectinload(Role.permissions))
        .options(selectinload(User.student))
        .options(selectinload(User.teacher))
        .filter(User.id == user_id)
        .first()
    )
    if user is None or not user.is_active:
        logger.warning("Token valid but user missing or inactive (id=%s)", user_id)
        raise credentials_exception

    # This dependency runs in a threadpool with a *copy* of the request
    # context, so the ContextVar set below is lost before the endpoint runs.
    # Stash the id on the request-scoped session too (get_db is cached per
    # request, so the endpoint shares this Session object) — the audit
    # listener reads session.info first and only falls back to the ContextVar.
    db.info["current_user_id"] = user.id
    current_user_id_var.set(user.id)
    return user


# ---------------------------------------------------------------------------
# Role-based guard (kept for backward compat and chat endpoints)
# ---------------------------------------------------------------------------
def require_role(*role_names: str):
    def role_checker(current_user: "User" = Depends(get_current_user)) -> "User":
        if not current_user.has_role(*role_names):
            logger.warning(
                "Role denied: user=%s roles=%s required=%s",
                current_user.username,
                current_user.role_names,
                role_names,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return role_checker


# ---------------------------------------------------------------------------
# Permission-based guard (preferred for business endpoints)
# ---------------------------------------------------------------------------
def require_permission(*permission_codes: "PermissionCode"):
    codes = {str(p.value) for p in permission_codes}

    def permission_checker(
        current_user: "User" = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> "User":
        cache = _ensure_cache(db)
        user_perms: set[str] = set()
        for r in current_user.roles:
            user_perms.update(cache.get(r.name, set()))

        if not user_perms & codes:
            logger.warning(
                "Permission denied: user=%s permissions=%s required=%s",
                current_user.username,
                user_perms,
                codes,
            )
            # Name the permission(s) that would grant access so the UI can show a
            # specific message instead of a bare "forbidden". Listing the required
            # codes (not the user's own) is safe and is what an admin needs to fix
            # the role grant.
            required = ", ".join(sorted(codes))
            detail = (
                f"Missing required permission: {required}"
                if len(codes) == 1
                else f"Missing required permission. Need one of: {required}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=detail,
            )
        return current_user
    return permission_checker


def get_user_permission_codes(user: "User", db: Session) -> set[str]:
    """All permission codes granted to the user via their roles."""
    cache = _ensure_cache(db)
    user_perms: set[str] = set()
    for r in user.roles:
        user_perms.update(cache.get(r.name, set()))
    return user_perms


def has_permission(user:"User",db:Session, *permission_codes:"PermissionCode") -> bool:
    codes = {str(p.value) for p in permission_codes}
    cache = _ensure_cache(db)
    user_perms: set[str] = set()
    for r in user.roles:
        user_perms.update(cache.get(r.name, set()))

    if not user_perms & codes:
        return False
    
    return True
