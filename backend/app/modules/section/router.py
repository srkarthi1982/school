import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.core.schemas import apply_sort, paginate
from app.modules.notification.services import notify_users_and_push

from .models import Schedule, Section
from .schemas import ScheduleCreate, ScheduleResponse, SectionCreate, SectionResponse, SectionUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sections", tags=["Sections & Schedules"])


@router.get("/", response_model=SuccessResponse[list[SectionResponse]])
def list_sections(
    course_id: int | None = None,
    semester_id: int | None = None,
    code: str | None = Query(None, description="Partial match on section code"),
    room: str | None = Query(None, description="Partial match on room"),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Section)
    if course_id:
        query = query.filter(Section.course_id == course_id)
    if semester_id:
        query = query.filter(Section.semester_id == semester_id)
    if code:
        query = query.filter(Section.code.ilike(f"%{code}%"))
    if room:
        query = query.filter(Section.room.ilike(f"%{room}%"))
    query = apply_sort(query, Section, sort_by, sort_order)
    return paginate(query, page, page_size)


@router.get("/{section_id}", response_model=SuccessResponse[SectionResponse])
def get_section(section_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return ok(section)


@router.post("/", response_model=SuccessResponse[SectionResponse], status_code=201)
def create_section(
    data: SectionCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.SECTION_WRITE)),
):
    section = Section(**data.model_dump())
    db.add(section)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Section code already exists in this semester")
    db.refresh(section)
    return ok(section)


@router.put("/{section_id}", response_model=SuccessResponse[SectionResponse])
def update_section(
    section_id: int,
    data: SectionUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.SECTION_WRITE)),
):
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    if section.version != data.version:
        raise HTTPException(status_code=409, detail="Resource was modified by another request. Reload and retry.")
    for key, value in data.model_dump(exclude={"version"}).items():
        setattr(section, key, value)
    db.commit()
    db.refresh(section)
    return ok(section)


@router.delete("/{section_id}", status_code=204)
def delete_section(
    section_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.SECTION_WRITE)),
):
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    db.delete(section)
    db.commit()


# --- Schedules ---
@router.get("/{section_id}/schedules", response_model=SuccessResponse[list[ScheduleResponse]])
def list_schedules(
    section_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Schedule).filter(Schedule.section_id == section_id)
    return paginate(query, page, page_size)


@router.post("/{section_id}/schedules", response_model=SuccessResponse[ScheduleResponse], status_code=201)
def create_schedule(
    section_id: int,
    data: ScheduleCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.SECTION_WRITE)),
):
    schedule = Schedule(
        section_id=section_id,
        day_of_week=data.day_of_week,
        start_time=data.start_time,
        end_time=data.end_time,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    section = db.query(Section).filter(Section.id == section_id).first()
    student_ids = [e.student_id for e in section.enrollments] if section else []

    if student_ids:
        schedule_day = data.day_of_week.value if hasattr(data.day_of_week, 'value') else data.day_of_week
        notify_users_and_push(
            student_ids,
            type="schedule.created",
            source_module="schedule",
            source_id=str(schedule.id),
            link="/dashboard-scheduling/schedule-management",
            title="New Schedule Added",
            body=f"A new schedule has been added for {section.code if section else 'your section'} on {schedule_day} from {data.start_time} to {data.end_time}.",
            payload={
                "schedule_id": str(schedule.id),
            },
        )

    return ok(schedule)


@router.delete("/{section_id}/schedules/{schedule_id}", status_code=204)
def delete_schedule(
    section_id: int,
    schedule_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.SECTION_WRITE)),
):
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id, Schedule.section_id == section_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(schedule)
    db.commit()
