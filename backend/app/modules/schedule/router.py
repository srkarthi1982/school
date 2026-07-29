from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok

from .schemas import ScheduleDetailResponse, ScheduleUpsert
from .services import (
    get_or_raise_master,
    serialize_schedule_detail,
    upsert_schedule,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/schedules", tags=["Schedule"])


@router.get("/{schedule_id}", response_model=SuccessResponse[ScheduleDetailResponse])
def get_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    master = get_or_raise_master(db, schedule_id)
    return ok(serialize_schedule_detail(db, master))


@router.put("/{schedule_id}", response_model=SuccessResponse[ScheduleDetailResponse])
def save_schedule(
    schedule_id: int,
    payload: ScheduleUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    master = get_or_raise_master(db, schedule_id)
    upsert_schedule(db, master, payload, user.id)
    return ok(serialize_schedule_detail(db, master))
