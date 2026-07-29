import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import invalidate_permission_cache, require_permission
from app.core.permissions import PermissionCode, get_permission_codes
from app.core.response import SuccessResponse, ok
from app.modules.users.models import Permission, Role, User
from app.modules.users.schemas import UserResponse

from .schemas import (
    PermissionResponse,
    RoleCreate,
    RolePermissionUpdate,
    RoleResponse,
    RoleUpdate,
    UserRoleAssignment,
)
from .service import (
    log_role_permission_change,
    log_user_role_change,
    resolve_roles,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/access", tags=["Access Management"])


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------
@router.get("/permissions", response_model=SuccessResponse[list[PermissionResponse]])
def list_permissions(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ROLE_MANAGE)),
):
    perms = db.query(Permission).order_by(Permission.module, Permission.name).all()
    return ok(perms)


@router.get("/permissions/{permission_id}", response_model=SuccessResponse[PermissionResponse])
def get_permission(
    permission_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ROLE_MANAGE)),
):
    perm = db.get(Permission, permission_id)
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    return ok(perm)


@router.get("/permission-codes", response_model=SuccessResponse[list[str]])
def list_permission_codes():
    """Return canonical list of permission codes registered in the app.

    Public endpoint (no auth) — values are non-sensitive metadata used by
    frontend tooling (`scripts/gen-permissions.mjs`) to generate TS types.
    """
    return ok(get_permission_codes())


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------
@router.get("/roles", response_model=SuccessResponse[list[RoleResponse]])
def list_roles(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ROLE_MANAGE)),
):
    roles = db.query(Role).order_by(Role.name).all()
    return ok(roles)


@router.get("/roles/{role_id}", response_model=SuccessResponse[RoleResponse])
def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ROLE_MANAGE)),
):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return ok(role)


@router.post("/roles", response_model=SuccessResponse[RoleResponse], status_code=201)
def create_role(
    data: RoleCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ROLE_MANAGE)),
):
    if db.query(Role).filter(Role.name == data.name).first():
        raise HTTPException(status_code=409, detail="Role name already exists")
    role = Role(name=data.name, description=data.description)
    db.add(role)
    db.commit()
    db.refresh(role)
    logger.info("Role created: id=%s name=%s", role.id, role.name)
    return ok(role)


@router.put("/roles/{role_id}", response_model=SuccessResponse[RoleResponse])
def update_role(
    role_id: int,
    data: RoleUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ROLE_MANAGE)),
):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.is_system and data.name is not None:
        raise HTTPException(status_code=403, detail="Cannot modify system role name")

    if data.name is not None:
        existing = db.query(Role).filter(Role.name == data.name, Role.id != role_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Role name already exists")
        role.name = data.name

    if data.description is not None:
        role.description = data.description

    db.commit()
    db.refresh(role)
    logger.info("Role updated: id=%s", role_id)
    return ok(role)


@router.delete("/roles/{role_id}", status_code=204)
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ROLE_MANAGE)),
):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=403, detail="Cannot delete system roles")
    if role.users:
        raise HTTPException(status_code=409, detail="Cannot delete role with assigned users")
    db.delete(role)
    db.commit()
    logger.info("Role deleted: id=%s name=%s", role_id, role.name)


@router.put("/roles/{role_id}/permissions", response_model=SuccessResponse[RoleResponse])
def update_role_permissions(
    role_id: int,
    data: RolePermissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.ROLE_MANAGE)),
):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    perms = db.query(Permission).filter(Permission.code.in_(data.permission_codes)).all()
    found_codes = {p.code for p in perms}
    missing = set(data.permission_codes) - found_codes
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown permissions: {', '.join(missing)}")

    old_codes = [p.code for p in role.permissions]
    role.permissions = perms
    db.commit()
    db.refresh(role)
    invalidate_permission_cache()
    log_role_permission_change(
        db,
        role_id=role_id,
        old_codes=old_codes,
        new_codes=[p.code for p in perms],
        acting_user_id=current_user.id,
    )
    db.commit()
    logger.info("Role permissions updated: role_id=%s count=%s", role_id, len(perms))
    return ok(role)


@router.get("/roles/{role_id}/users", response_model=SuccessResponse[list[UserResponse]])
def list_role_users(
    role_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ROLE_MANAGE)),
):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return ok(role.users)


# ---------------------------------------------------------------------------
# User roles
# ---------------------------------------------------------------------------
@router.put("/users/{user_id}/roles", response_model=SuccessResponse[UserResponse])
def update_user_roles(
    user_id: int,
    data: UserRoleAssignment,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PermissionCode.ROLE_MANAGE)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.version != data.version:
        raise HTTPException(
            status_code=409,
            detail="Resource was modified by another request. Reload and retry.",
        )

    old_roles = user.role_names
    roles = resolve_roles(db, data.role_names)
    user.roles = roles
    db.commit()
    db.refresh(user)
    log_user_role_change(
        db,
        user_id=user_id,
        old_roles=old_roles,
        new_roles=user.role_names,
        acting_user_id=current_user.id,
    )
    db.commit()
    logger.info("User roles updated: user_id=%s %s -> %s", user_id, old_roles, user.role_names)
    return ok(user)
