import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.core.schemas import apply_sort, paginate

from .models import AcademicYear, Semester
from .schemas import (
    AcademicYearCreate,
    AcademicYearResponse,
    AcademicYearUpdate,
    SemesterCreate,
    SemesterResponse,
    SemesterUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Academic Calendar"])


# ---------------------------------------------------------------------------
# Academic Years
# ---------------------------------------------------------------------------
@router.get("/academic-years", response_model=SuccessResponse[list[AcademicYearResponse]])
def list_academic_years(
    name: str | None = Query(None, description="Partial match on name"),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(AcademicYear)
    if name:
        query = query.filter(AcademicYear.name.ilike(f"%{name}%"))
    query = apply_sort(query, AcademicYear, sort_by, sort_order)
    return paginate(query, page, page_size)


@router.post("/academic-years", response_model=SuccessResponse[AcademicYearResponse], status_code=201)
def create_academic_year(
    data: AcademicYearCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.TERM_WRITE)),
):
    ay = AcademicYear(**data.model_dump())
    db.add(ay)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Academic year name already exists")
    db.refresh(ay)
    return ok(ay)


@router.put("/academic-years/{year_id}", response_model=SuccessResponse[AcademicYearResponse])
def update_academic_year(
    year_id: int,
    data: AcademicYearUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.TERM_WRITE)),
):
    ay = db.get(AcademicYear, year_id)
    if not ay:
        raise HTTPException(status_code=404, detail="Academic year not found")
    for key, value in data.model_dump().items():
        setattr(ay, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Academic year name already exists")
    db.refresh(ay)
    return ok(ay)


@router.delete("/academic-years/{year_id}", status_code=204)
def delete_academic_year(
    year_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.TERM_WRITE)),
):
    ay = db.get(AcademicYear, year_id)
    if not ay:
        raise HTTPException(status_code=404, detail="Academic year not found")
    db.delete(ay)
    db.commit()


# ---------------------------------------------------------------------------
# Semesters
# ---------------------------------------------------------------------------
@router.get("/semesters", response_model=SuccessResponse[list[SemesterResponse]])
def list_semesters(
    academic_year_id: int | None = None,
    name: str | None = Query(None, description="Partial match on name"),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Semester)
    if academic_year_id:
        query = query.filter(Semester.academic_year_id == academic_year_id)
    if name:
        query = query.filter(Semester.name.ilike(f"%{name}%"))
    query = apply_sort(query, Semester, sort_by, sort_order)
    return paginate(query, page, page_size)


@router.post("/semesters", response_model=SuccessResponse[SemesterResponse], status_code=201)
def create_semester(
    data: SemesterCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.TERM_WRITE)),
):
    sem = Semester(**data.model_dump())
    db.add(sem)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not create semester — constraint violation")
    db.refresh(sem)
    return ok(sem)


@router.put("/semesters/{semester_id}", response_model=SuccessResponse[SemesterResponse])
def update_semester(
    semester_id: int,
    data: SemesterUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.TERM_WRITE)),
):
    sem = db.get(Semester, semester_id)
    if not sem:
        raise HTTPException(status_code=404, detail="Semester not found")
    for key, value in data.model_dump().items():
        setattr(sem, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not update semester — constraint violation")
    db.refresh(sem)
    return ok(sem)


@router.delete("/semesters/{semester_id}", status_code=204)
def delete_semester(
    semester_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.TERM_WRITE)),
):
    sem = db.get(Semester, semester_id)
    if not sem:
        raise HTTPException(status_code=404, detail="Semester not found")
    db.delete(sem)
    db.commit()
