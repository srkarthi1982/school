import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.core.schemas import apply_sort, paginate

from .models import Enrollment
from .schemas import EnrollmentCreate, EnrollmentResponse, EnrollmentUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/enrollments", tags=["Enrollments & Grades"])


@router.get("/", response_model=SuccessResponse[list[EnrollmentResponse]])
def list_enrollments(
    student_id: int | None = None,
    section_id: int | None = None,
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Enrollment)
    if student_id:
        query = query.filter(Enrollment.student_id == student_id)
    if section_id:
        query = query.filter(Enrollment.section_id == section_id)
    query = apply_sort(query, Enrollment, sort_by, sort_order)
    return paginate(query, page, page_size)


@router.post("/", response_model=SuccessResponse[EnrollmentResponse], status_code=201)
def create_enrollment(
    data: EnrollmentCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ENROLLMENT_WRITE)),
):
    existing = db.query(Enrollment).filter(
        Enrollment.student_id == data.student_id,
        Enrollment.section_id == data.section_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Student already enrolled in this section")

    enrollment = Enrollment(**data.model_dump())
    db.add(enrollment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Student already enrolled in this section")
    db.refresh(enrollment)
    return ok(enrollment)


@router.put("/{enrollment_id}", response_model=SuccessResponse[EnrollmentResponse])
def update_enrollment(
    enrollment_id: int,
    data: EnrollmentUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.GRADE_WRITE)),
):
    enrollment = db.get(Enrollment, enrollment_id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    if enrollment.version != data.version:
        raise HTTPException(status_code=409, detail="Resource was modified by another request. Reload and retry.")
    for key, value in data.model_dump(exclude={"version"}, exclude_unset=True).items():
        setattr(enrollment, key, value)
    db.commit()
    db.refresh(enrollment)
    return ok(enrollment)


@router.delete("/{enrollment_id}", status_code=204)
def delete_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ENROLLMENT_WRITE)),
):
    enrollment = db.get(Enrollment, enrollment_id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    db.delete(enrollment)
    db.commit()
