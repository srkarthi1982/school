import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.core.schemas import apply_sort, paginate
from app.modules.users.models import User

from .models import ScheduleEntry
from .schemas import ScheduleEntryCreate, ScheduleEntryResponse, ScheduleEntryUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/schedule-entries", tags=["Schedule Entries"])


@router.get("/", response_model=SuccessResponse[list[ScheduleEntryResponse]])
def list_schedule_entries(
    start_after: datetime | None = Query(None, description="Filter entries with start_at >= this"),
    start_before: datetime | None = Query(None, description="Filter entries with start_at <= this"),
    course_id: int | None = None,
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    query = db.query(ScheduleEntry).filter(ScheduleEntry.user_id == user.id)
    if start_after:
        query = query.filter(ScheduleEntry.start_at >= start_after)
    if start_before:
        query = query.filter(ScheduleEntry.start_at <= start_before)
    if course_id:
        query = query.filter(ScheduleEntry.course_id == course_id)
    query = apply_sort(query, ScheduleEntry, sort_by or "start_at", sort_order)
    return paginate(query, page, page_size)


@router.get("/{entry_id}", response_model=SuccessResponse[ScheduleEntryResponse])
def get_schedule_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    entry = db.get(ScheduleEntry, entry_id)
    if not entry or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    return ok(entry)


@router.post("/", response_model=SuccessResponse[ScheduleEntryResponse], status_code=201)
def create_schedule_entry(
    data: ScheduleEntryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_WRITE)),
):
    if data.end_at <= data.start_at:
        raise HTTPException(status_code=422, detail="end_at must be after start_at")
    entry = ScheduleEntry(
        user_id=user.id,
        course_id=data.course_id,
        start_at=data.start_at,
        end_at=data.end_at,
        title=data.title,
        description=data.description,
        importance=data.importance,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return ok(entry)


@router.put("/{entry_id}", response_model=SuccessResponse[ScheduleEntryResponse])
def update_schedule_entry(
    entry_id: int,
    data: ScheduleEntryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_WRITE)),
):
    entry = db.get(ScheduleEntry, entry_id)
    if not entry or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    if entry.version != data.version:
        raise HTTPException(status_code=409, detail="Resource was modified by another request. Reload and retry.")
    if data.end_at <= data.start_at:
        raise HTTPException(status_code=422, detail="end_at must be after start_at")
    for key, value in data.model_dump(exclude={"version"}).items():
        setattr(entry, key, value)
    db.commit()
    db.refresh(entry)
    return ok(entry)


@router.delete("/{entry_id}", status_code=204)
def delete_schedule_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_WRITE)),
):
    entry = db.get(ScheduleEntry, entry_id)
    if not entry or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    db.delete(entry)
    db.commit()
