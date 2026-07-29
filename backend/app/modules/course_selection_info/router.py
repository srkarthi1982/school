from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok

# The .docx parsers and combo-box option dictionaries are global/owner-agnostic
# and reused verbatim from the master Course Information module.
from app.modules.course_info.services import (
    create_resource_option,
    list_resource_options,
    parse_general_information_docx,
    parse_lesson_creation_docx,
    parse_lesson_planning_docx,
    parse_resources_docx,
)
from app.modules.course_info.schemas import (
    GeneralInformationData,
    GeneralInformationTabResponse,
    GeneralInformationTabUpsert,
    LessonAssociationsResponse,
    LessonCreationData,
    LessonCreationModifiedLessonsResponse,
    LessonCreationTabResponse,
    LessonCreationTabUpsert,
    LessonPlanningData,
    LessonPlanningTabResponse,
    LessonPlanningTabUpsert,
    LessonResourceCategoryOption,
    PersonnelRequirementTabResponse,
    PersonnelRequirementTabUpsert,
    ResourceOptionCreate,
    ResourceOptionResponse,
    ResourcesData,
    ResourcesTabResponse,
    ResourcesTabUpsert,
    TpLinkPreviewData,
)
from . import services
from .schemas import CourseSelectionInfoDetailResponse, CourseSelectionInfoUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/course-selection-info", tags=["Course Selection Information"])


async def _validated_docx(file: UploadFile) -> bytes:
    """Read + validate an uploaded .docx, reusing the master helper.

    Imported lazily to avoid a module-load-time import of ``course_info.router``
    (which participates in the course_info ↔ course_master import cycle)."""
    from app.modules.course_info.router import _read_validated_docx

    return await _read_validated_docx(file)


# ─── Resource option dictionary (shared with the master) ────────────────────
# Static-path routes must precede ``/{course_instance_id}`` (FastAPI matches in
# declaration order).

@router.get(
    "/resource-options",
    response_model=SuccessResponse[list[ResourceOptionResponse]],
)
def list_resource_options_endpoint(
    kind: str,
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


# ─── Header ─────────────────────────────────────────────────────────────────

@router.get("/{course_instance_id}", response_model=SuccessResponse[CourseSelectionInfoDetailResponse])
def get_course_info(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    # Lazily clone from the master the first time the category is opened.
    services.seed_course_info_from_master(db, course)
    return ok(services.serialize_course_info_detail(course))


@router.put("/{course_instance_id}", response_model=SuccessResponse[CourseSelectionInfoDetailResponse])
def update_course_info(
    course_instance_id: int,
    data: CourseSelectionInfoUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.update_title(db, course, data.course_title, user.id)
    return ok(services.serialize_course_info_detail(course))


# ─── General Information tab ────────────────────────────────────────────────

@router.get(
    "/{course_instance_id}/tabs/general",
    response_model=SuccessResponse[GeneralInformationTabResponse],
)
def get_general_information_tab(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    tab_status, data = services.get_general_tab(course)
    return ok(GeneralInformationTabResponse(status=tab_status, data=data))


@router.put(
    "/{course_instance_id}/tabs/general",
    response_model=SuccessResponse[GeneralInformationTabResponse],
)
def upsert_general_information_tab(
    course_instance_id: int,
    payload: GeneralInformationTabUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    services.upsert_general_tab(db, course, payload.status, payload.data, user.id)
    tab_status, data = services.get_general_tab(course)
    return ok(GeneralInformationTabResponse(status=tab_status, data=data))


@router.post(
    "/{course_instance_id}/tabs/general/import",
    response_model=SuccessResponse[GeneralInformationData],
)
async def import_general_information_tab(
    course_instance_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    services.get_or_raise_course(db, course_instance_id)
    file_bytes = await _validated_docx(file)
    data = parse_general_information_docx(db, file_bytes, user.id)
    return ok(data)


# ─── Personnel Requirement tab ──────────────────────────────────────────────

@router.get(
    "/{course_instance_id}/tabs/personnel-requirement",
    response_model=SuccessResponse[PersonnelRequirementTabResponse],
)
def get_personnel_requirement_tab_endpoint(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    tab_status, data = services.get_personnel_requirement_tab(course)
    return ok(PersonnelRequirementTabResponse(status=tab_status, data=data))


@router.put(
    "/{course_instance_id}/tabs/personnel-requirement",
    response_model=SuccessResponse[PersonnelRequirementTabResponse],
)
def upsert_personnel_requirement_tab_endpoint(
    course_instance_id: int,
    payload: PersonnelRequirementTabUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    services.upsert_personnel_requirement_tab(db, course, payload.status, payload.data, user.id)
    tab_status, data = services.get_personnel_requirement_tab(course)
    return ok(PersonnelRequirementTabResponse(status=tab_status, data=data))


# ─── Resources tab ──────────────────────────────────────────────────────────

@router.get(
    "/{course_instance_id}/tabs/resources",
    response_model=SuccessResponse[ResourcesTabResponse],
)
def get_resources_tab_endpoint(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    tab_status, data = services.get_resources_tab(course)
    return ok(ResourcesTabResponse(status=tab_status, data=data))


@router.put(
    "/{course_instance_id}/tabs/resources",
    response_model=SuccessResponse[ResourcesTabResponse],
)
def upsert_resources_tab_endpoint(
    course_instance_id: int,
    payload: ResourcesTabUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    services.upsert_resources_tab(db, course, payload.status, payload.data, user.id)
    tab_status, data = services.get_resources_tab(course)
    return ok(ResourcesTabResponse(status=tab_status, data=data))


@router.post(
    "/{course_instance_id}/tabs/resources/import",
    response_model=SuccessResponse[ResourcesData],
)
async def import_resources_tab(
    course_instance_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    services.get_or_raise_course(db, course_instance_id)
    file_bytes = await _validated_docx(file)
    data = parse_resources_docx(db, file_bytes, user.id)
    return ok(data)


# ─── Lesson Planning tab ────────────────────────────────────────────────────

@router.get(
    "/{course_instance_id}/tabs/lesson-planning",
    response_model=SuccessResponse[LessonPlanningTabResponse],
)
def get_lesson_planning_tab_endpoint(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    tab_status, data = services.get_lesson_planning_tab(course)
    return ok(LessonPlanningTabResponse(status=tab_status, data=data))


@router.put(
    "/{course_instance_id}/tabs/lesson-planning",
    response_model=SuccessResponse[LessonPlanningTabResponse],
)
def upsert_lesson_planning_tab_endpoint(
    course_instance_id: int,
    payload: LessonPlanningTabUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    services.upsert_lesson_planning_tab(db, course, payload.status, payload.data, user.id)
    tab_status, data = services.get_lesson_planning_tab(course)
    return ok(LessonPlanningTabResponse(status=tab_status, data=data))


@router.post(
    "/{course_instance_id}/tabs/lesson-planning/import",
    response_model=SuccessResponse[LessonPlanningData],
)
async def import_lesson_planning_tab(
    course_instance_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    services.get_or_raise_course(db, course_instance_id)
    file_bytes = await _validated_docx(file)
    data = parse_lesson_planning_docx(db, file_bytes, user.id)
    return ok(data)


# ─── Lesson Creation tab ────────────────────────────────────────────────────

@router.get(
    "/{course_instance_id}/tabs/lesson-creation",
    response_model=SuccessResponse[LessonCreationTabResponse],
)
def get_lesson_creation_tab_endpoint(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    tab_status, data = services.get_lesson_creation_tab(course)
    return ok(LessonCreationTabResponse(status=tab_status, data=data))


@router.put(
    "/{course_instance_id}/tabs/lesson-creation",
    response_model=SuccessResponse[LessonCreationTabResponse],
)
def upsert_lesson_creation_tab_endpoint(
    course_instance_id: int,
    payload: LessonCreationTabUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    services.upsert_lesson_creation_tab(db, course, payload.status, payload.data, user.id)
    tab_status, data = services.get_lesson_creation_tab(course)
    return ok(LessonCreationTabResponse(status=tab_status, data=data))


@router.post(
    "/{course_instance_id}/tabs/lesson-creation/import",
    response_model=SuccessResponse[LessonCreationData],
)
async def import_lesson_creation_tab(
    course_instance_id: int,
    syllabus: UploadFile = File(..., description="Detailed Syllabus .docx (lesson list)"),
    scalar: UploadFile = File(..., description="Instructional Scalar .docx (TO/EO/TP)"),
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_INFO_WRITE)),
):
    services.get_or_raise_course(db, course_instance_id)
    syllabus_bytes = await _validated_docx(syllabus)
    scalar_bytes = await _validated_docx(scalar)
    data = parse_lesson_creation_docx(db, syllabus_bytes, scalar_bytes, user.id)
    return ok(data)


@router.get(
    "/{course_instance_id}/tabs/lesson-creation/resource-options",
    response_model=SuccessResponse[list[LessonResourceCategoryOption]],
)
def list_lesson_resource_options_endpoint(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    return ok(services.list_lesson_resource_options(course))


@router.get(
    "/{course_instance_id}/tabs/lesson-creation/modified-lessons",
    response_model=SuccessResponse[LessonCreationModifiedLessonsResponse],
)
def get_lesson_creation_modified_lessons_endpoint(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    """Instance Lesson Creation lesson ids whose content has drifted from the
    master — drives the per-lesson "Modified" badge in the editor's list."""
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    modified = services.lesson_creation_modified_lessons(course)
    return ok(LessonCreationModifiedLessonsResponse(modified_lesson_ids=sorted(modified)))


@router.get(
    "/{course_instance_id}/tabs/lesson-creation/lessons/{lesson_id}/associations",
    response_model=SuccessResponse[LessonAssociationsResponse],
)
def get_lesson_associations_endpoint(
    course_instance_id: int,
    lesson_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    """How many instance Material / Form Builder / Evaluation records still
    reference this lesson — drives the warn-before-delete prompt in the editor."""
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    return ok(services.get_lesson_associations(db, course, lesson_id))


# ─── TP Link Preview tab (derived, read-only) ───────────────────────────────

@router.get(
    "/{course_instance_id}/tabs/tp-link-preview",
    response_model=SuccessResponse[TpLinkPreviewData],
)
def get_tp_link_preview_endpoint(
    course_instance_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_INFO_READ)),
):
    course = services.get_or_raise_course(db, course_instance_id)
    services.seed_course_info_from_master(db, course)
    return ok(services.get_tp_link_preview(db, course))
