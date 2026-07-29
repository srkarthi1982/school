from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok

from . import reports
from .schemas import (
    ConcurrencyResponse,
    FeaturesResponse,
    OverviewResponse,
    TerminalsResponse,
    UsersResponse,
)

router = APIRouter(prefix="/analytics", tags=["Usage Analytics"])

_read = Depends(require_permission(PermissionCode.ANALYTICS_READ))
_Days = Query(30, ge=1, le=365, description="Trailing window in days")


@router.get("/overview", response_model=SuccessResponse[OverviewResponse])
def get_overview(
    days: int = _Days,
    db: Session = Depends(get_db),
    _=_read,
):
    """Registered baseline, DAU/WAU/MAU, active-in-range, and a daily trend."""
    return ok(reports.overview(db, days))


@router.get("/concurrency", response_model=SuccessResponse[ConcurrencyResponse])
def get_concurrency(
    days: int = _Days,
    db: Session = Depends(get_db),
    _=_read,
):
    """Average / max concurrent users and a per-day avg+max series."""
    return ok(reports.concurrency(db, days))


@router.get("/users", response_model=SuccessResponse[UsersResponse])
def get_users(
    days: int = _Days,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=_read,
):
    """Most-active users: events, active days, and login count."""
    return ok(reports.users(db, days, limit))


@router.get("/features", response_model=SuccessResponse[FeaturesResponse])
def get_features(
    days: int = _Days,
    db: Session = Depends(get_db),
    _=_read,
):
    """Every feature ranked by reach (distinct users), with visits & requests."""
    return ok(reports.features(db, days))


@router.get("/terminals", response_model=SuccessResponse[TerminalsResponse])
def get_terminals(
    days: int = _Days,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=_read,
):
    """Usage by client IP / network location."""
    return ok(reports.terminals(db, days, limit))
