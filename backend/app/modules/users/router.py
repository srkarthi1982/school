import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import ApiResponse, SuccessResponse, ok
from app.core.schemas import apply_sort, paginate
from app.core.security import hash_password, verify_password

from .models import AuthProvider, Role, User
from .schemas import PasswordChange, UserCreate, UserResponse, UserUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=SuccessResponse[list[UserResponse]])
def list_users(
    roles: str | None = None,
    username: str | None = None,
    email: str | None = None,
    full_name: str | None = None,
    is_active: bool | None = None,
    sort_by: str | None = None,
    sort_order: str = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.USER_READ)),
):
    query = db.query(User)
    if roles:
        query = query.join(User.roles).filter(Role.name == roles)
    if username:
        query = query.filter(User.username.ilike(f"%{username}%"))
    if email:
        query = query.filter(User.email.ilike(f"%{email}%"))
    if full_name:
        query = query.filter(User.full_name.ilike(f"%{full_name}%"))
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    query = apply_sort(query, User, sort_by, sort_order)
    return paginate(query, page, page_size)


@router.get("/{user_id}", response_model=SuccessResponse[UserResponse])
def get_user(user_id: int, db: Session = Depends(get_db), _=Depends(require_permission(PermissionCode.USER_READ))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return ok(user)


@router.post("/", response_model=SuccessResponse[UserResponse], status_code=201)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.USER_WRITE)),
):
    if db.query(User).join(User.profile).filter(or_(User.email == data.email, User.username == data.username)).first():
        raise HTTPException(
            status_code=409, detail="Email or username already in use")

    user = User(
        email=data.email,
        username=data.username,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        is_active=data.is_active,
        is_external=True
    )

    profile = user.profile
    profile.date_of_birth = data.date_of_birth
    profile.country = data.country
    profile.mobile_no = data.mobile_no
    profile.ext_no = data.ext_no

    if data.roles:
        roles = db.query(Role).filter(Role.name.in_(data.roles)).all()
        found_names = {r.name for r in roles}
        missing = set(data.roles) - found_names
        if missing:
            raise HTTPException(
                status_code=400, detail=f"Unknown roles: {', '.join(missing)}")
        user.roles = roles

    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("User created by admin: id=%s username=%s",
                user.id, user.username)
    return ok(user)


@router.put("/{user_id}", response_model=SuccessResponse[UserResponse])
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.USER_WRITE)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.version != data.version:
        raise HTTPException(
            status_code=409, detail="Resource was modified by another request. Reload and retry.")

    if data.email is not None and data.email != user.email:
        if db.query(User).filter(User.email == data.email, User.id != user_id).first():
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = data.email

    if data.username is not None and data.username != user.username:
        if db.query(User).filter(User.username == data.username, User.id != user_id).first():
            raise HTTPException(
                status_code=400, detail="Username already in use")
        user.username = data.username

    if data.full_name is not None:
        user.full_name = data.full_name

    if data.roles is not None:
        roles = db.query(Role).filter(Role.name.in_(data.roles)).all()
        found_names = {r.name for r in roles}
        missing = set(data.roles) - found_names
        if missing:
            raise HTTPException(
                status_code=400, detail=f"Unknown roles: {', '.join(missing)}")
        user.roles = roles

    if data.is_active is not None:
        user.is_active = data.is_active

    if data.password is not None:
        user.hashed_password = hash_password(data.password)

    db.commit()
    db.refresh(user)
    logger.info("User updated: user_id=%s by admin", user_id)
    return ok(user)


@router.patch("/{user_id}/deactivate", response_model=SuccessResponse[UserResponse])
def deactivate_user(
    user_id: int,
    version: int = Query(...,
                         description="Current version of the user record"),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.USER_WRITE)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.version != version:
        raise HTTPException(
            status_code=409, detail="Resource was modified by another request. Reload and retry.")
    user.is_active = False
    db.commit()
    db.refresh(user)
    logger.info("User deactivated: user_id=%s username=%s",
                user_id, user.username)
    return ok(user)


@router.patch("/{user_id}/activate", response_model=SuccessResponse[UserResponse])
def activate_user(
    user_id: int,
    version: int = Query(...,
                         description="Current version of the user record"),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.USER_WRITE)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.version != version:
        raise HTTPException(
            status_code=409, detail="Resource was modified by another request. Reload and retry.")
    user.is_active = True
    db.commit()
    db.refresh(user)
    logger.info("User activated: user_id=%s username=%s",
                user_id, user.username)
    return ok(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.USER_WRITE)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    logger.info("User deleted: user_id=%s username=%s", user_id, user.username)


@router.put("/{user_id}/passwd", response_model=ApiResponse)
def change_password(user_id: int, data: PasswordChange, db: Session = Depends(get_db), current_user:User=Depends(get_current_user)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.auth_provider == AuthProvider.LDAP:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot change password for this type of user.")
    if not current_user or user.username != current_user.username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Change password not allowed.")

    if not verify_password(data.old_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid password")

    user.hashed_password = hash_password(data.new_password)
    db.commit()

    return ApiResponse(success=True)
