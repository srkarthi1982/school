import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.core.schemas import apply_sort, paginate

from app.modules.course_info.services import (
    compute_completion_pct as compute_course_info_completion_pct,
)
from app.modules.material.services import (
    get_or_raise_master,
    serialize_material,
)
from app.modules.material.schemas import MaterialResponse
from app.modules.evaluation.services import serialize_evaluation
from app.modules.evaluation.schemas import EvaluationResponse
from app.modules.form_builder.services import serialize_form_builder
from app.modules.form_builder.schemas import FormBuilderResponse
from app.modules.schedule.services import (
    ensure_schedule_for_master,
    serialize_schedule_detail,
)
from app.modules.schedule.schemas import ScheduleDetailResponse
from app.modules.course.models import CourseInstance

from .clone import clone_master
from .models import CourseMaster
from .schemas import (
    CourseMasterClone,
    CourseMasterCreate,
    CourseMasterResponse,
    CourseMasterUpdate,
)


def _sync_course_info_completion(db: Session, master: CourseMaster) -> None:
    """Mirror the Course Information tabs' live completion into the master."""
    master.course_info_completion = int(
        round(compute_course_info_completion_pct(master))
    )


def _count_linked_courses(db: Session, master_id: int) -> int:
    """How many Course instances (Course Selection) are spawned from this master."""
    return (
        db.query(func.count(CourseInstance.id))
        .filter(CourseInstance.master_id == master_id)
        .scalar()
        or 0
    )


def _attach_course_count(db: Session, master: CourseMaster) -> None:
    """Set the transient ``course_count`` read by CourseMasterResponse."""
    master.course_count = _count_linked_courses(db, master.id)


def _assert_unique_title_ctp(
    db: Session, title: str, ctp_version: str | None, exclude_id: int | None = None
) -> None:
    """Reject a duplicate (title, CTP Version) before it hits the DB constraint,
    so the client gets a clean 409 instead of a raw integrity error. The title
    match is case-insensitive ("ABC" == "Abc"); CTP Version is matched exactly."""
    query = db.query(CourseMaster.id).filter(
        func.lower(CourseMaster.title) == title.lower(),
        CourseMaster.ctp_version == ctp_version,
    )
    if exclude_id is not None:
        query = query.filter(CourseMaster.id != exclude_id)
    if db.query(query.exists()).scalar():
        raise HTTPException(
            status_code=409,
            detail="A course with this title and CTP Version already exists.",
        )


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/course-masters", tags=["Course Builder"])


@router.get("/", response_model=SuccessResponse[list[CourseMasterResponse]])
def list_course_masters(
    title: str | None = Query(None, description="Partial match on title"),
    course_date: date | None = Query(None, description="Exact match on course date"),
    status: str | None = Query(None, description="Exact match on status"),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db)
):
    query = db.query(CourseMaster)
    if title:
        query = query.filter(CourseMaster.title.ilike(f"%{title}%"))
    if course_date:
        query = query.filter(CourseMaster.course_date == course_date)
    if status:
        query = query.filter(CourseMaster.status == status)
    query = apply_sort(query, CourseMaster, sort_by, sort_order)
    response = paginate(query, page, page_size)
    for master in response.data:
        _sync_course_info_completion(db, master)
        _attach_course_count(db, master)
    return response


@router.get("/{master_id}", response_model=SuccessResponse[CourseMasterResponse])
def get_course_master(
    master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_MASTER_READ)),
):
    master = db.get(CourseMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Course master not found")
    _sync_course_info_completion(db, master)
    _attach_course_count(db, master)
    return ok(master)


@router.post("/", response_model=SuccessResponse[CourseMasterResponse], status_code=201)
def create_course_master(
    data: CourseMasterCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_MASTER_WRITE)),
):
    _assert_unique_title_ctp(db, data.title, data.ctp_version)
    master = CourseMaster(**data.model_dump(), created_by_id=user.id, updated_by_id=user.id)
    db.add(master)
    db.commit()
    db.refresh(master)
    _attach_course_count(db, master)
    return ok(master)


@router.post("/clone", response_model=SuccessResponse[CourseMasterResponse], status_code=201)
def clone_course_master(
    data: CourseMasterClone,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_MASTER_WRITE)),
):
    """Deep-clone a course master into a fresh draft.

    Duplicates the source master and every relation (Course Information,
    Material, Form Builder, Evaluation, Schedule). The new master is reset to
    ``draft`` with all five categories at 0% / not complete. The (title, CTP
    Version) uniqueness rule applies to the new master just like a create.
    """
    source = db.get(CourseMaster, data.source_master_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source course master not found")
    _assert_unique_title_ctp(db, data.title, data.ctp_version)
    master = clone_master(
        db,
        source,
        title=data.title,
        ctp_version=data.ctp_version,
        course_date=data.course_date,
        user_id=user.id,
    )
    db.commit()
    db.refresh(master)
    _sync_course_info_completion(db, master)
    _attach_course_count(db, master)
    return ok(master)


@router.put("/{master_id}", response_model=SuccessResponse[CourseMasterResponse])
def update_course_master(
    master_id: int,
    data: CourseMasterUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_MASTER_WRITE)),
):
    master = db.get(CourseMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Course master not found")
    updates = data.model_dump(exclude_unset=True)
    # Cancelling approval (approved → draft) re-opens the master for editing.
    # Block it while any Course instance is still linked, since those instances
    # depend on the approved master — they must be deleted first.
    cancelling_approval = (
        master.status == "approved" and updates.get("status") == "draft"
    )
    if cancelling_approval and _count_linked_courses(db, master.id) > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot cancel approval because there are courses linked to this "
                "course master. Linked courses must be deleted first before the "
                "course master can be modified."
            ),
        )
    if "title" in updates or "ctp_version" in updates:
        _assert_unique_title_ctp(
            db,
            updates.get("title", master.title),
            updates.get("ctp_version", master.ctp_version),
            exclude_id=master.id,
        )
    for key, value in updates.items():
        setattr(master, key, value)
    master.updated_by_id = user.id
    db.commit()
    db.refresh(master)
    _attach_course_count(db, master)
    return ok(master)


@router.delete("/{master_id}", status_code=204)
def delete_course_master(
    master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_MASTER_WRITE)),
):
    master = db.get(CourseMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Course master not found")
    if master.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="An approved course cannot be deleted. Cancel approval first.",
        )
    if _count_linked_courses(db, master.id) > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot delete a course master with linked course instances. "
                "Delete the linked courses first."
            ),
        )
    
    from ..material.services import purge_material
    
    purge_material(db,course_master_id=master_id)
    db.delete(master)
    db.commit()


@router.post(
    "/{master_id}/material",
    response_model=SuccessResponse[MaterialResponse],
)
def ensure_course_master_material(
    master_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.MATERIAL_WRITE)),
):
    """Return the Material view for this course master.

    The Material category no longer has its own row — a course master *is* its
    material (title + ``material_completion`` live on the master, folders/files
    hang off ``course_master_id``). This endpoint is kept for API stability and
    is trivially idempotent: it just returns the material view of the master.
    """
    master = get_or_raise_master(db, master_id)
    return ok(serialize_material(db, master))


@router.post(
    "/{master_id}/evaluation",
    response_model=SuccessResponse[EvaluationResponse],
)
def ensure_course_master_evaluation(
    master_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.EVALUATION_WRITE)),
):
    """Return the Evaluation view for this course master.

    The Evaluation category no longer has its own row — a course master *is* its
    evaluation (title + ``evaluation_completion`` live on the master, the
    lesson↔quiz associations hang off ``course_master_id``). Kept for API
    stability and trivially idempotent: it just returns the evaluation view of
    the master.
    """
    master = db.get(CourseMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Course master not found")

    return ok(serialize_evaluation(master))


@router.post(
    "/{master_id}/form-builder",
    response_model=SuccessResponse[FormBuilderResponse],
)
def ensure_course_master_form_builder(
    master_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.FORM_BUILDER_WRITE)),
):
    """Return the Form Builder view for this course master.

    The Form Builder category no longer has its own row — a course master *is*
    its form builder (title + ``surveys_completion`` live on the master, the
    survey/form links hang off ``course_master_id``). Kept for API stability and
    trivially idempotent: it just returns the form-builder view of the master.
    """
    master = db.get(CourseMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Course master not found")

    return ok(serialize_form_builder(master))


@router.post(
    "/{master_id}/schedule",
    response_model=SuccessResponse[ScheduleDetailResponse],
)
def ensure_course_master_schedule(
    master_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    """Return the Schedule linked to this course master, creating one if missing.

    Idempotent: subsequent calls return the existing schedule. The grid config
    and lesson catalogue are derived live from the course's Course Information,
    so they always reflect the latest Lesson Planning / Lesson Creation values.
    """
    master = db.get(CourseMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Course master not found")

    ensure_schedule_for_master(db, master, user.id)
    return ok(serialize_schedule_detail(db, master))
