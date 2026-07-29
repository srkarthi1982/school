import logging
from datetime import timedelta

from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy import func
from starlette.datastructures import FormData
from jose import JWTError
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.limiter import limiter
from app.core.response import  SuccessResponse, ok
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.modules.profile.models import Profile
from app.modules.users.models import AuthProvider, Role, User
from app.modules.users.schemas import UserResponse

from .schemas import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse

if settings.LDAP_MOCK:
    from .services_mock import authenticate_ldap
else:
    from .services import authenticate_ldap

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

_REFRESH_COOKIE = "refresh_token"
_REFRESH_MAX_AGE = int(
    timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=_REFRESH_MAX_AGE,
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=_REFRESH_COOKIE,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path="/",
    )


@router.post("/register", response_model=SuccessResponse[UserResponse], status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).options(joinedload(User.profile)).where((func.lower(Profile.email) == func.lower(data.email)) | (func.lower(User.username) == func.lower(data.username))).first():
        logger.info(
            "Registration rejected: duplicate email/username=%s", data.username)
        raise HTTPException(
            status_code=400, detail="Email or username already registered")

    student_role = db.query(Role).filter(Role.name == "student").first()
    if not student_role:
        raise HTTPException(
            status_code=500, detail="Default student role not found")

    user = User(
        email=data.email,
        username=data.username,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        auth_provider=AuthProvider.EMAIL,
        is_active=False,
    )

    user.roles.append(student_role)
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("User registered: id=%s username=%s", user.id, user.username)
    return ok(user)


def _do_authentication(user: User, password: str):
    if not user.is_active:
        logger.warning(
            "Login attempt on disabled account: username=%s", user.username)
        raise HTTPException(status_code=403, detail="Account is disabled")

    if user.auth_provider == AuthProvider.LDAP:
        ldap_info = authenticate_ldap(user.username, password)
        if ldap_info:
            return  # success
    else:
        if not user.is_active:
            logger.warning(
                "Login attempt on disabled account: username=%s", user.username)
            raise HTTPException(status_code=403, detail="Account is disabled")

        if verify_password(password, user.hashed_password):
            return

    logger.warning("Login failed: unknown username=%s", user.username)
    raise HTTPException(status_code=401, detail="Invalid credentials")


def _do_register(username: str, password: str, db: Session):
    ldap_info = authenticate_ldap(username, password)
    if not ldap_info:
        logger.warning("Login failed: unknown username=%s", username)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    student_role = db.query(Role).filter(Role.name == "student").first()
    if not student_role:
        raise HTTPException(
            status_code=500, detail="Default student role not found")

    user = User(
        email=ldap_info["email"],
        username=ldap_info["username"],
        full_name=ldap_info["full_name"],
        auth_provider=AuthProvider.LDAP,
        is_active=False
    )
    user.roles.append(student_role)
    db.add(user)
    db.commit()
    db.refresh(user)


@router.post("/login", status_code=200)
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    # Handle both JSON body (programmatic API) and form data (Swagger OAuth2 flow)
    if "application/json" in request.headers.get("Content-Type", ""):
        data = LoginRequest(**await request.json())
    else:
        form_data: FormData = await request.form()
        data = LoginRequest(
            username=form_data.get("username", ""),
            password=form_data.get("password", ""),
        )
    user = db.query(User).filter(func.lower(User.username)
                                 == func.lower(data.username)).first()

    if not user:
        _do_register(data.username, data.password, db)
        return

    _do_authentication(user, data.password)
    logger.info("Login success: user_id=%s username=%s",
                user.id, user.username)
    # Record the login for usage analytics (the request carries no bearer token
    # yet, so the tracking middleware can't attribute it — do it explicitly).
    from app.modules.analytics.tracking import record_login
    record_login(request, user.id)
    token_data = {
        "sub": str(user.id),
        "roles": [r.name for r in user.roles],
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    _set_refresh_cookie(response, refresh_token)

    # Return tokens at root level for Swagger OAuth2 compatibility
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=200,
        content={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
        },
    )


@router.post("/refresh", response_model=SuccessResponse[TokenResponse])
def refresh_token_endpoint(
    request: Request,
    response: Response,
    data: RefreshRequest = Body(default=RefreshRequest()),
    db: Session = Depends(get_db),
):
    # Cookie takes precedence over request body
    raw_token = request.cookies.get(_REFRESH_COOKIE) or data.refresh_token
    if not raw_token:
        raise HTTPException(
            status_code=401, detail="No refresh token provided")

    try:
        payload = decode_token(raw_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=401, detail="User not found or disabled")

    token_data = {
        "sub": str(user.id),
        "roles": [r.name for r in user.roles],
    }
    new_refresh = create_refresh_token(token_data)
    _set_refresh_cookie(response, new_refresh)
    return ok(TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=new_refresh,
    ))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    # No auth required: logout only clears the refresh cookie and must stay
    # idempotent. The client discards its access token before calling this, so
    # requiring a valid token here would just fail with "Not authenticated".
    _clear_refresh_cookie(response)


@router.get("/me", response_model=SuccessResponse[UserResponse])
def get_me(current_user: User = Depends(get_current_user)):
    return ok(current_user)


@router.get("/me/permissions", response_model=SuccessResponse[list[str]])
def get_my_permissions(current_user: User = Depends(get_current_user)):
    perms = list({p.code for r in current_user.roles for p in r.permissions})
    return ok(perms)
