import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.core.schemas import apply_sort, paginate

from .models import Course, Department, Program
from .schemas import (
    CourseCreate,
    CourseResponse,
    CourseUpdate,
    DepartmentCreate,
    DepartmentResponse,
    DepartmentUpdate,
    ProgramCreate,
    ProgramResponse,
    ProgramUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/catalog")

# ---------------------------------------------------------------------------
# Departments
# ---------------------------------------------------------------------------
dept_router = APIRouter(prefix="/departments", tags=["Departments"])


@dept_router.get("/", response_model=SuccessResponse[list[DepartmentResponse]])
def list_departments(
    name: str | None = Query(None, description="Partial match on name"),
    code: str | None = Query(None, description="Partial match on code"),
    description: str | None = Query(None, description="Partial match on description"),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Department)
    if name:
        query = query.filter(Department.name.ilike(f"%{name}%"))
    if code:
        query = query.filter(Department.code.ilike(f"%{code}%"))
    if description:
        query = query.filter(Department.description.ilike(f"%{description}%"))
    query = apply_sort(query, Department, sort_by, sort_order)
    return paginate(query, page, page_size)


@dept_router.get("/{department_id}", response_model=SuccessResponse[DepartmentResponse])
def get_department(department_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    dept = db.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return ok(dept)


@dept_router.post("/", response_model=SuccessResponse[DepartmentResponse], status_code=201)
def create_department(
    data: DepartmentCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CATALOG_WRITE)),
):
    dept = Department(**data.model_dump())
    db.add(dept)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Department code already exists")
    db.refresh(dept)
    return ok(dept)


@dept_router.put("/{department_id}", response_model=SuccessResponse[DepartmentResponse])
def update_department(
    department_id: int,
    data: DepartmentUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CATALOG_WRITE)),
):
    dept = db.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    for key, value in data.model_dump().items():
        setattr(dept, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Department code already exists")
    db.refresh(dept)
    return ok(dept)


@dept_router.delete("/{department_id}", status_code=204)
def delete_department(
    department_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CATALOG_WRITE)),
):
    dept = db.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    db.delete(dept)
    db.commit()


# ---------------------------------------------------------------------------
# Programs
# ---------------------------------------------------------------------------
prog_router = APIRouter(prefix="/programs", tags=["Programs"])


@prog_router.get("/", response_model=SuccessResponse[list[ProgramResponse]])
def list_programs(
    department_id: int | None = None,
    name: str | None = Query(None, description="Partial match on name"),
    code: str | None = Query(None, description="Partial match on code"),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Program)
    if department_id:
        query = query.filter(Program.department_id == department_id)
    if name:
        query = query.filter(Program.name.ilike(f"%{name}%"))
    if code:
        query = query.filter(Program.code.ilike(f"%{code}%"))
    query = apply_sort(query, Program, sort_by, sort_order)
    return paginate(query, page, page_size)


@prog_router.get("/{program_id}", response_model=SuccessResponse[ProgramResponse])
def get_program(program_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    prog = db.get(Program, program_id)
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    return ok(prog)


@prog_router.post("/", response_model=SuccessResponse[ProgramResponse], status_code=201)
def create_program(
    data: ProgramCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CATALOG_WRITE)),
):
    prog = Program(**data.model_dump())
    db.add(prog)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Program code already exists")
    db.refresh(prog)
    return ok(prog)


@prog_router.put("/{program_id}", response_model=SuccessResponse[ProgramResponse])
def update_program(
    program_id: int,
    data: ProgramUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CATALOG_WRITE)),
):
    prog = db.get(Program, program_id)
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    for key, value in data.model_dump().items():
        setattr(prog, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Program code already exists")
    db.refresh(prog)
    return ok(prog)


@prog_router.delete("/{program_id}", status_code=204)
def delete_program(
    program_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CATALOG_WRITE)),
):
    prog = db.get(Program, program_id)
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    db.delete(prog)
    db.commit()


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------
course_router = APIRouter(prefix="/courses", tags=["Courses"])


@course_router.get("/", response_model=SuccessResponse[list[CourseResponse]])
def list_courses(
    department_id: int | None = None,
    name: str | None = Query(None, description="Partial match on name"),
    code: str | None = Query(None, description="Partial match on code"),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Course)
    if department_id:
        query = query.filter(Course.department_id == department_id)
    if name:
        query = query.filter(Course.name.ilike(f"%{name}%"))
    if code:
        query = query.filter(Course.code.ilike(f"%{code}%"))
    query = apply_sort(query, Course, sort_by, sort_order)
    return paginate(query, page, page_size)


@course_router.get("/{course_id}", response_model=SuccessResponse[CourseResponse])
def get_course(course_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return ok(course)


@course_router.post("/", response_model=SuccessResponse[CourseResponse], status_code=201)
def create_course(
    data: CourseCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CATALOG_WRITE)),
):
    course = Course(**data.model_dump())
    db.add(course)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Course code already exists")
    db.refresh(course)
    return ok(course)


@course_router.put("/{course_id}", response_model=SuccessResponse[CourseResponse])
def update_course(
    course_id: int,
    data: CourseUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CATALOG_WRITE)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    for key, value in data.model_dump().items():
        setattr(course, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Course code already exists")
    db.refresh(course)
    return ok(course)


@course_router.delete("/{course_id}", status_code=204)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.CATALOG_WRITE)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    db.delete(course)
    db.commit()


# Include sub-routers
router.include_router(dept_router)
router.include_router(prog_router)
router.include_router(course_router)
