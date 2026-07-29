import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok

from .models import DynamicForm
from .schemas import DynamicFormCreate, DynamicFormNoCourseResponse, DynamicFormResponse, DynamicFormSummary, DynamicFormUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/forms", tags=["Dynamic Forms"])


@router.get("/", response_model=SuccessResponse[list[DynamicFormResponse]])
def list_dynamic_forms(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_WRITE)),
):
    forms = db.query(DynamicForm).all()
    return ok(forms)


@router.get("/courses", response_model=SuccessResponse[list[str]])
def list_course_names(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_WRITE)),
):
    courses = (
        db.query(DynamicForm.course_name)
        .filter(DynamicForm.course_name.isnot(None))
        .distinct()
        .all()
    )
    return ok([c[0] for c in courses])


@router.get("/no-course", response_model=SuccessResponse[list[DynamicFormNoCourseResponse]])
def list_dynamic_forms_no_course(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_WRITE)),
):
    forms = db.query(DynamicForm).filter(DynamicForm.course_name.is_(None)).all()
    return ok([DynamicFormNoCourseResponse.model_validate(f) for f in forms])


@router.get("/has-course-by-title", response_model=SuccessResponse[list[DynamicFormResponse]])
def list_dynamic_forms_by_course(
    title: str,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_WRITE)),
):
    forms = db.query(DynamicForm).filter(DynamicForm.course_name.isnot(None), DynamicForm.title == title).all()
    return ok(forms)


@router.get("/summary", response_model=SuccessResponse[list[DynamicFormSummary]])
def list_dynamic_forms_summary(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_WRITE)),
):
    forms = db.query(DynamicForm.id, DynamicForm.title, DynamicForm.course_name, DynamicForm.description).all()
    return ok([DynamicFormSummary(id=f.id, title=f.title, course_name=f.course_name, description=f.description) for f in forms])


@router.post("/", response_model=SuccessResponse[DynamicFormResponse], status_code=201)
def create_dynamic_form(
    data: DynamicFormCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_WRITE)),
):
    form = DynamicForm(**data.model_dump())
    db.add(form)
    db.commit()
    db.refresh(form)
    logger.info("Dynamic form created: id=%s title=%s", form.id, form.title)
    return ok(form)


@router.get("/{form_id}", response_model=SuccessResponse[DynamicFormResponse])
def get_dynamic_form(
    form_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_READ)),
):
    form = db.get(DynamicForm, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return ok(form)


@router.put("/{form_id}", response_model=SuccessResponse[DynamicFormResponse])
def update_dynamic_form(
    form_id: int,
    data: DynamicFormUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_WRITE)),
):
    form = db.get(DynamicForm, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    if form.version != data.version:
        raise HTTPException(
            status_code=409,
            detail="Resource was modified by another request. Reload and retry.",
        )
    for key, value in data.model_dump(exclude={"version"}, exclude_unset=True).items():
        setattr(form, key, value)
    db.commit()
    db.refresh(form)
    return ok(form)


@router.delete("/{form_id}", status_code=204)
def delete_dynamic_form(
    form_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FORM_DELETE)),
):
    form = db.get(DynamicForm, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    db.delete(form)
    db.commit()
