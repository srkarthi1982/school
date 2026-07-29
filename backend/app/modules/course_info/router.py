from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.file_validation import validate_uploaded_file
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok

from .schemas import (
    CourseInfoDetailResponse,
    CourseInfoUpdate,
    GeneralInformationData,
    GeneralInformationTabResponse,
    GeneralInformationTabUpsert,
    LessonAssociationsResponse,
    LessonCreationData,
    LessonCreationTabResponse,
    LessonCreationTabUpsert,
    LessonResourceCategoryOption,
    LessonPlanningData,
    LessonPlanningTabResponse,
    LessonPlanningTabUpsert,
    PersonnelRequirementTabResponse,
    PersonnelRequirementTabUpsert,
    ResourceOptionCreate,
    ResourceOptionResponse,
    ResourcesData,
    ResourcesTabResponse,
    ResourcesTabUpsert,
    TpLinkPreviewData,
)
from .services import (
    create_resource_option,
    get_general_tab,
    get_lesson_associations,
    get_lesson_creation_tab,
    get_lesson_planning_tab,
    get_or_raise_course_master,
    get_personnel_requirement_tab,
    get_resources_tab,
    get_tp_link_preview,
    list_lesson_resource_options,
    list_resource_options,
    parse_general_information_docx,
    parse_lesson_creation_docx,
    parse_lesson_planning_docx,
    parse_resources_docx,
    serialize_course_info_detail,
    upsert_general_tab,
    upsert_lesson_creation_tab,
    upsert_lesson_planning_tab,
    upsert_personnel_requirement_tab,
    upsert_resources_tab,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/course-infos", tags=["Course Information"])


# ─── Resource option dictionary (combo-box suggestions) ─────────────────────
# NB: these static-path endpoints must be declared *before* the
# ``/{course_master_id}`` routes — FastAPI matches routes in declaration order
# and ``{course_master_id}`` would otherwise swallow ``/resource-options``.

@router.get(
    "/resource-options",
    response_model=SuccessResponse[list[ResourceOptionResponse]],
)
def list_resource_options_endpoint(
    kind: str = Query(..., description="Combo-box dictionary key"),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    options = list_resource_options(db, kind)
    return ok([ResourceOptionResponse.model_validate(o) for o in options])


@router.post(
    "/resource-options",
    response_model=SuccessResponse[ResourceOptionResponse],
)
def create_resource_option_endpoint(
    payload: ResourceOptionCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    option = create_resource_option(db, payload.kind, payload.label, user.id)
    return ok(ResourceOptionResponse.model_validate(option))


@router.get("/{course_master_id}", response_model=SuccessResponse[CourseInfoDetailResponse])
def get_course_info(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    master = get_or_raise_course_master(db, course_master_id)
    return ok(serialize_course_info_detail(master))


@router.put("/{course_master_id}", response_model=SuccessResponse[CourseInfoDetailResponse])
def update_course_info(
    course_master_id: int,
    data: CourseInfoUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    master = get_or_raise_course_master(db, course_master_id)
    if master.version != data.version:
        raise HTTPException(
            status_code=409,
            detail="Resource was modified by another request. Reload and retry.",
        )
    if data.course_title is not None:
        master.title = data.course_title
    master.updated_by_id = user.id
    db.commit()
    db.refresh(master)
    return ok(serialize_course_info_detail(master))


# ─── General Information tab ────────────────────────────────────────────────

@router.get(
    "/{course_master_id}/tabs/general",
    response_model=SuccessResponse[GeneralInformationTabResponse],
)
def get_general_information_tab(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    master = get_or_raise_course_master(db, course_master_id)
    tab_status, data = get_general_tab(master)
    return ok(GeneralInformationTabResponse(status=tab_status, data=data))


@router.put(
    "/{course_master_id}/tabs/general",
    response_model=SuccessResponse[GeneralInformationTabResponse],
)
def upsert_general_information_tab(
    course_master_id: int,
    payload: GeneralInformationTabUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    master = get_or_raise_course_master(db, course_master_id)
    upsert_general_tab(
        db,
        master,
        new_status=payload.status,
        data=payload.data,
        user_id=user.id,
    )
    tab_status, data = get_general_tab(master)
    return ok(GeneralInformationTabResponse(status=tab_status, data=data))


_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_IMPORT_MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


async def _read_validated_docx(file: UploadFile) -> bytes:
    """Read an uploaded .docx and enforce type + size limits.

    python-docx is a zip under the hood, so the magic-byte check would see
    "zip" rather than the Office MIME — validate the declared type + size only
    and let the parser reject anything that is not a real Word document.
    """
    file_bytes = await file.read()
    if (file.content_type or "") not in (_DOCX_MIME, "application/zip", "application/octet-stream"):
        validate_uploaded_file(
            content_type=file.content_type or "",
            file_bytes=file_bytes,
            allowed_types={_DOCX_MIME},
            max_size_bytes=_IMPORT_MAX_SIZE_BYTES,
        )
    elif len(file_bytes) > _IMPORT_MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {_IMPORT_MAX_SIZE_BYTES // (1024 * 1024)} MB",
        )
    return file_bytes


@router.post(
    "/{course_master_id}/tabs/general/import",
    response_model=SuccessResponse[GeneralInformationData],
)
async def import_general_information_tab(
    course_master_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    """Parse an uploaded General Course Information .docx and return form data.

    The result is returned for the user to review and Save — nothing is written
    to the General Information tab here. Free-text entry standards are persisted
    as ``course_entry_standard`` master options (hence COURSE_INFO_WRITE).
    """
    get_or_raise_course_master(db, course_master_id)  # 404 if the course doesn't exist
    file_bytes = await _read_validated_docx(file)
    data = parse_general_information_docx(db, file_bytes, user.id)
    return ok(data)


# ─── Personnel Requirement tab ──────────────────────────────────────────────

@router.get(
    "/{course_master_id}/tabs/personnel-requirement",
    response_model=SuccessResponse[PersonnelRequirementTabResponse],
)
def get_personnel_requirement_tab_endpoint(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    master = get_or_raise_course_master(db, course_master_id)
    tab_status, data = get_personnel_requirement_tab(master)
    return ok(PersonnelRequirementTabResponse(status=tab_status, data=data))


@router.put(
    "/{course_master_id}/tabs/personnel-requirement",
    response_model=SuccessResponse[PersonnelRequirementTabResponse],
)
def upsert_personnel_requirement_tab_endpoint(
    course_master_id: int,
    payload: PersonnelRequirementTabUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    master = get_or_raise_course_master(db, course_master_id)
    upsert_personnel_requirement_tab(
        db,
        master,
        new_status=payload.status,
        data=payload.data,
        user_id=user.id,
    )
    tab_status, data = get_personnel_requirement_tab(master)
    return ok(PersonnelRequirementTabResponse(status=tab_status, data=data))


# ─── Resources tab ──────────────────────────────────────────────────────────

@router.get(
    "/{course_master_id}/tabs/resources",
    response_model=SuccessResponse[ResourcesTabResponse],
)
def get_resources_tab_endpoint(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    master = get_or_raise_course_master(db, course_master_id)
    tab_status, data = get_resources_tab(master)
    return ok(ResourcesTabResponse(status=tab_status, data=data))


@router.put(
    "/{course_master_id}/tabs/resources",
    response_model=SuccessResponse[ResourcesTabResponse],
)
def upsert_resources_tab_endpoint(
    course_master_id: int,
    payload: ResourcesTabUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    master = get_or_raise_course_master(db, course_master_id)
    upsert_resources_tab(
        db,
        master,
        new_status=payload.status,
        data=payload.data,
        user_id=user.id,
    )
    tab_status, data = get_resources_tab(master)
    return ok(ResourcesTabResponse(status=tab_status, data=data))


@router.post(
    "/{course_master_id}/tabs/resources/import",
    response_model=SuccessResponse[ResourcesData],
)
async def import_resources_tab(
    course_master_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    """Parse an uploaded Course Resources .docx and return form data.

    Returned for review (nothing written to the Resources tab). Each parsed item
    is persisted as the matching master option (hence COURSE_INFO_WRITE).
    """
    get_or_raise_course_master(db, course_master_id)  # 404 if the course doesn't exist
    file_bytes = await _read_validated_docx(file)
    data = parse_resources_docx(db, file_bytes, user.id)
    return ok(data)


# ─── Lesson Planning tab ────────────────────────────────────────────────────

@router.get(
    "/{course_master_id}/tabs/lesson-planning",
    response_model=SuccessResponse[LessonPlanningTabResponse],
)
def get_lesson_planning_tab_endpoint(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    master = get_or_raise_course_master(db, course_master_id)
    tab_status, data = get_lesson_planning_tab(master)
    return ok(LessonPlanningTabResponse(status=tab_status, data=data))


@router.put(
    "/{course_master_id}/tabs/lesson-planning",
    response_model=SuccessResponse[LessonPlanningTabResponse],
)
def upsert_lesson_planning_tab_endpoint(
    course_master_id: int,
    payload: LessonPlanningTabUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    master = get_or_raise_course_master(db, course_master_id)
    upsert_lesson_planning_tab(
        db,
        master,
        new_status=payload.status,
        data=payload.data,
        user_id=user.id,
    )
    tab_status, data = get_lesson_planning_tab(master)
    return ok(LessonPlanningTabResponse(status=tab_status, data=data))


@router.post(
    "/{course_master_id}/tabs/lesson-planning/import",
    response_model=SuccessResponse[LessonPlanningData],
)
async def import_lesson_planning_tab(
    course_master_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    """Parse an uploaded Instructional Scalar .docx into TO/EO/TP lists.

    Returned for review (nothing written to the Lesson Planning tab). Each parsed
    objective / teaching point is persisted as the matching master option (hence
    COURSE_INFO_WRITE).
    """
    get_or_raise_course_master(db, course_master_id)  # 404 if the course doesn't exist
    file_bytes = await _read_validated_docx(file)
    data = parse_lesson_planning_docx(db, file_bytes, user.id)
    return ok(data)


# ─── Lesson Creation tab ────────────────────────────────────────────────────

@router.get(
    "/{course_master_id}/tabs/lesson-creation",
    response_model=SuccessResponse[LessonCreationTabResponse],
)
def get_lesson_creation_tab_endpoint(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    master = get_or_raise_course_master(db, course_master_id)
    tab_status, data = get_lesson_creation_tab(master)
    return ok(LessonCreationTabResponse(status=tab_status, data=data))


@router.put(
    "/{course_master_id}/tabs/lesson-creation",
    response_model=SuccessResponse[LessonCreationTabResponse],
)
def upsert_lesson_creation_tab_endpoint(
    course_master_id: int,
    payload: LessonCreationTabUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    master = get_or_raise_course_master(db, course_master_id)
    upsert_lesson_creation_tab(
        db,
        master,
        new_status=payload.status,
        data=payload.data,
        user_id=user.id,
    )
    tab_status, data = get_lesson_creation_tab(master)
    return ok(LessonCreationTabResponse(status=tab_status, data=data))


@router.post(
    "/{course_master_id}/tabs/lesson-creation/import",
    response_model=SuccessResponse[LessonCreationData],
)
async def import_lesson_creation_tab(
    course_master_id: int,
    syllabus: UploadFile = File(..., description="Detailed Syllabus .docx (lesson list)"),
    scalar: UploadFile = File(..., description="Instructional Scalar .docx (TO/EO/TP)"),
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    """Build Lesson Creation data from two uploaded .docx files.

    ``syllabus`` provides the lesson list (Period + flight timing); ``scalar``
    provides the TO/EO/TP units attached to each lesson by its Lsn/Ref code.
    Returned for review; objectives/teaching points/period types are persisted
    as master options (hence COURSE_INFO_WRITE).
    """
    get_or_raise_course_master(db, course_master_id)  # 404 if the course doesn't exist
    syllabus_bytes = await _read_validated_docx(syllabus)
    scalar_bytes = await _read_validated_docx(scalar)
    data = parse_lesson_creation_docx(db, syllabus_bytes, scalar_bytes, user.id)
    return ok(data)


@router.get(
    "/{course_master_id}/tabs/lesson-creation/resource-options",
    response_model=SuccessResponse[list[LessonResourceCategoryOption]],
)
def list_lesson_resource_options_endpoint(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    """Resources (grouped by category) a lesson can attach, taken from this
    course's Resources tab — feeds the two dependent combo boxes in the
    lesson editor."""
    master = get_or_raise_course_master(db, course_master_id)
    return ok(list_lesson_resource_options(master))


@router.get(
    "/{course_master_id}/tabs/lesson-creation/lessons/{lesson_id}/associations",
    response_model=SuccessResponse[LessonAssociationsResponse],
)
def get_lesson_associations_endpoint(
    course_master_id: int,
    lesson_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    """How many Material / Form Builder / Evaluation / Schedule records still
    reference this lesson — drives the warn-before-delete prompt in the editor."""
    master = get_or_raise_course_master(db, course_master_id)
    return ok(get_lesson_associations(db, master, lesson_id))


# ─── TP Link Preview tab (derived, read-only) ───────────────────────────────

@router.get(
    "/{course_master_id}/tabs/tp-link-preview",
    response_model=SuccessResponse[TpLinkPreviewData],
)
def get_tp_link_preview_endpoint(
    course_master_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    """TO -> EO -> TP tree of teaching points used by lessons, plus the
    teaching points not yet associated with any lesson."""
    master = get_or_raise_course_master(db, course_master_id)
    return ok(get_tp_link_preview(db, master))
