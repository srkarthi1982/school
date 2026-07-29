from __future__ import annotations

import logging
from typing import Type

from fastapi import HTTPException, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

import app.modules.course_selection_info.models as csi_models
from app.modules.course.models import CourseInstance
from app.modules.course_info import services as ci
from app.modules.course_info.models import MasterCourseEntryStandard
from app.modules.course_info.schemas import (
    CourseEntryStandardItem,
    GeneralInformationData,
    LessonCreationData,
    LessonPlanningData,
    PersonnelRequirementData,
    ProgrammedWorkingHours,
    ResourcesData,
)
from app.modules.course_selection_info.models import (
    CourseSelectionInfoEntryStandard,
    CourseSelectionInfoGeneralInformation,
    CourseSelectionInfoLessonCreation,
    CourseSelectionInfoLessonCreationLesson,
    CourseSelectionInfoLessonPlanning,
    CourseSelectionInfoPersonnelRequirement,
    CourseSelectionInfoResources,
)
from app.modules.course_selection_info.schemas import (
    CourseSelectionInfoDetailResponse,
    CourseInfoTabSummary,
)

logger = logging.getLogger(__name__)


# Audit/PK columns are never copied straight across during the seed clone.
_AUDIT_COLS = frozenset({"created_at", "updated_at", "created_by_id", "updated_by_id"})

# The 5 Course Information tab relationship attributes on ``CourseInstance``.
_INSTANCE_TAB_ATTR: dict[str, str] = {
    "general": "course_info_general",
    "personnel_requirement": "course_info_personnel_requirement",
    "resources": "course_info_resources",
    "lesson_planning": "course_info_lesson_planning",
    "lesson_creation": "course_info_lesson_creation",
}


def _instance_cls(master_cls: Type) -> Type:
    """Map a master ``CourseInfo*`` ORM class to its instance mirror class."""
    name = master_cls.__name__.replace("CourseInfo", "CourseSelectionInfo", 1)
    return getattr(csi_models, name)


# Instance child-class overrides for the reused master writers. Same shape as
# the master constants, with the per-course child classes swapped for mirrors.
_CS_RESOURCES_ITEM_FIELDS = tuple(
    (sf, orm_rel, master_model, _instance_cls(item_cls), fk, idattr, qty, oqty)
    for (sf, orm_rel, master_model, item_cls, fk, idattr, qty, oqty) in ci._RESOURCES_ITEM_FIELDS
)
_CS_LESSON_PLANNING_ITEM_CLASSES = {
    k: _instance_cls(v) for k, v in ci._LESSON_PLANNING_ITEM_CLASSES.items()
}


# ---------------------------------------------------------------------------
# Lookup + completion
# ---------------------------------------------------------------------------

def get_or_raise_course(db: Session, course_instance_id: int) -> CourseInstance:
    course = db.get(CourseInstance, course_instance_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course information not found"
        )
    return course


def _get_tab_row(course: CourseInstance, tab_no: str):
    attr = _INSTANCE_TAB_ATTR.get(tab_no)
    if attr is None:
        return None
    return getattr(course, attr, None)


# Course Selection instances only let the user edit Lesson Creation; every other
# tab is inherited read-only from the approved master and therefore always counts
# as complete. Keep in sync with the frontend's editor ``editableTabNos``.
INSTANCE_EDITABLE_TAB_NOS: frozenset[str] = frozenset({"lesson_creation"})


def compute_completion_pct(course: CourseInstance) -> float:
    """Percentage of implemented tabs marked complete on this instance.

    Only the editable tabs (Lesson Creation) carry a live status; the locked,
    master-inherited tabs are always counted as complete so an instance with a
    finished Lesson Creation reads 100%, not 20%."""
    if ci.TOTAL_TAB_COUNT == 0:
        return 0.0
    completed = 0
    for tab_no in ci.IMPLEMENTED_TAB_NOS:
        if tab_no not in INSTANCE_EDITABLE_TAB_NOS:
            completed += 1
            continue
        row = _get_tab_row(course, tab_no)
        if row is not None and getattr(row, "status", None) == "complete":
            completed += 1
    return round((completed / ci.TOTAL_TAB_COUNT) * 100, 2)


def _sync_instance_completion(course: CourseInstance) -> None:
    """Mirror the live completion into the instance's gate column so the Course
    Selection detail page reflects the change immediately."""
    course.course_info_completion = int(round(compute_completion_pct(course)))


def _validate_status(new_status: str) -> None:
    if new_status not in ("incomplete", "draft", "complete"):
        raise HTTPException(
            status_code=400,
            detail="status must be 'incomplete', 'draft' or 'complete'",
        )


def build_tab_summaries(course: CourseInstance) -> list[CourseInfoTabSummary]:
    summaries: list[CourseInfoTabSummary] = []
    for slug, name in ci.TAB_CATALOGUE:
        row = _get_tab_row(course, slug)
        summaries.append(
            CourseInfoTabSummary(
                tab_no=slug,
                tab_name=name,
                status=getattr(row, "status", "incomplete") if row else "incomplete",
            )
        )
    return summaries


def serialize_course_info_detail(course: CourseInstance) -> CourseSelectionInfoDetailResponse:
    return CourseSelectionInfoDetailResponse(
        id=course.id,
        course_instance_id=course.id,
        course_title=course.title,
        version=course.version,
        created_by_id=course.created_by_id,
        updated_by_id=course.updated_by_id,
        created_at=course.created_at,
        updated_at=course.updated_at,
        completion_pct=compute_completion_pct(course),
        course_status=course.status,
        tabs=build_tab_summaries(course),
    )


def update_title(db: Session, course: CourseInstance, course_title: str | None, user_id: int) -> CourseInstance:
    if course_title is not None:
        course.title = course_title
    course.updated_by_id = user_id
    db.commit()
    db.refresh(course)
    return course


# ---------------------------------------------------------------------------
# General Information tab (instance owner: title on course, ctp on row)
# ---------------------------------------------------------------------------

def _general_to_data(row: CourseSelectionInfoGeneralInformation, course: CourseInstance) -> GeneralInformationData:
    return GeneralInformationData(
        courseTitle=course.title,
        courseDuration=row.course_duration,
        programmedWorkingHours=ProgrammedWorkingHours(
            frequency=row.programmed_working_frequency,
            startTime=row.programmed_working_start_time,
            endTime=row.programmed_working_end_time,
        ),
        ctpVersion=row.ctp_version,
        courseAim=row.course_aim,
        courseEntryStandard=[
            CourseEntryStandardItem(courseEntryStandardId=es.course_entry_standard_id)
            for es in row.entry_standards
        ],
    )


def _apply_general_data(
    db: Session, row: CourseSelectionInfoGeneralInformation, data: GeneralInformationData,
    course: CourseInstance,
) -> None:
    if data.courseTitle:
        course.title = data.courseTitle
    row.course_duration = data.courseDuration
    pwh = data.programmedWorkingHours
    if pwh is not None:
        row.programmed_working_frequency = pwh.frequency
        row.programmed_working_start_time = pwh.startTime
        row.programmed_working_end_time = pwh.endTime
    else:
        row.programmed_working_frequency = None
        row.programmed_working_start_time = None
        row.programmed_working_end_time = None
    row.ctp_version = data.ctpVersion
    row.course_aim = data.courseAim
    ci._rebuild_label_only_item_list(
        db,
        collection=row.entry_standards,
        items=data.courseEntryStandard or [],
        master_model=MasterCourseEntryStandard,
        item_orm_cls=CourseSelectionInfoEntryStandard,
        fk_attr="course_entry_standard_id",
        id_attr="courseEntryStandardId",
    )


def get_general_tab(course: CourseInstance) -> tuple[str, GeneralInformationData | None]:
    row = course.course_info_general
    if row is None:
        return "incomplete", GeneralInformationData(courseTitle=course.title)
    return row.status, _general_to_data(row, course)


def upsert_general_tab(db, course, new_status, data, user_id) -> CourseSelectionInfoGeneralInformation:
    _validate_status(new_status)
    row = course.course_info_general
    ci._guard_unmark_when_approved(course, row, new_status)
    if row is None:
        row = CourseSelectionInfoGeneralInformation(
            course_instance_id=course.id, status=new_status,
            created_by_id=user_id, updated_by_id=user_id,
        )
        db.add(row)
        _apply_general_data(db, row, data, course)
        course.course_info_general = row
    else:
        row.status = new_status
        _apply_general_data(db, row, data, course)
        row.updated_by_id = user_id
    _sync_instance_completion(course)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Personnel Requirement tab
# ---------------------------------------------------------------------------

def get_personnel_requirement_tab(course: CourseInstance) -> tuple[str, PersonnelRequirementData | None]:
    row = course.course_info_personnel_requirement
    if row is None:
        return "incomplete", None
    return row.status, ci._personnel_to_data(row)


def upsert_personnel_requirement_tab(db, course, new_status, data, user_id) -> CourseSelectionInfoPersonnelRequirement:
    _validate_status(new_status)
    row = course.course_info_personnel_requirement
    ci._guard_unmark_when_approved(course, row, new_status)
    if row is None:
        row = CourseSelectionInfoPersonnelRequirement(
            course_instance_id=course.id, status=new_status,
            created_by_id=user_id, updated_by_id=user_id,
        )
        db.add(row)
        ci._apply_personnel_data(
            db, row, data,
            item_orm_cls=_instance_cls(ci.CourseInfoInstructorQualificationRequirement),
        )
        course.course_info_personnel_requirement = row
    else:
        row.status = new_status
        ci._apply_personnel_data(
            db, row, data,
            item_orm_cls=_instance_cls(ci.CourseInfoInstructorQualificationRequirement),
        )
        row.updated_by_id = user_id
    _sync_instance_completion(course)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Resources tab
# ---------------------------------------------------------------------------

def get_resources_tab(course: CourseInstance) -> tuple[str, ResourcesData | None]:
    row = course.course_info_resources
    if row is None:
        return "incomplete", None
    return row.status, ci._resources_to_data(row)


def upsert_resources_tab(db, course, new_status, data, user_id) -> CourseSelectionInfoResources:
    _validate_status(new_status)
    row = course.course_info_resources
    ci._guard_unmark_when_approved(course, row, new_status)
    if row is None:
        row = CourseSelectionInfoResources(
            course_instance_id=course.id, status=new_status,
            created_by_id=user_id, updated_by_id=user_id,
        )
        db.add(row)
        ci._apply_resources_data(db, row, data, fields=_CS_RESOURCES_ITEM_FIELDS)
        course.course_info_resources = row
    else:
        row.status = new_status
        ci._apply_resources_data(db, row, data, fields=_CS_RESOURCES_ITEM_FIELDS)
        row.updated_by_id = user_id
    _sync_instance_completion(course)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Lesson Planning tab
# ---------------------------------------------------------------------------

def get_lesson_planning_tab(course: CourseInstance) -> tuple[str, LessonPlanningData | None]:
    row = course.course_info_lesson_planning
    if row is None:
        return "incomplete", None
    return row.status, ci._lesson_planning_to_data(row)


def upsert_lesson_planning_tab(db, course, new_status, data, user_id) -> CourseSelectionInfoLessonPlanning:
    _validate_status(new_status)
    row = course.course_info_lesson_planning
    ci._guard_unmark_when_approved(course, row, new_status)
    if row is None:
        row = CourseSelectionInfoLessonPlanning(
            course_instance_id=course.id, status=new_status,
            created_by_id=user_id, updated_by_id=user_id,
        )
        db.add(row)
        ci._apply_lesson_planning_data(db, row, data, classes=_CS_LESSON_PLANNING_ITEM_CLASSES)
        course.course_info_lesson_planning = row
    else:
        row.status = new_status
        ci._apply_lesson_planning_data(db, row, data, classes=_CS_LESSON_PLANNING_ITEM_CLASSES)
        row.updated_by_id = user_id
    _sync_instance_completion(course)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Lesson Creation tab
# ---------------------------------------------------------------------------

def get_lesson_creation_tab(course: CourseInstance) -> tuple[str, LessonCreationData | None]:
    row = course.course_info_lesson_creation
    if row is None:
        return "incomplete", None
    return row.status, ci._lesson_creation_to_data(row)


def upsert_lesson_creation_tab(db, course, new_status, data, user_id) -> CourseSelectionInfoLessonCreation:
    _validate_status(new_status)
    row = course.course_info_lesson_creation
    ci._guard_unmark_when_approved(course, row, new_status)
    lesson_classes = dict(
        lesson_cls=_instance_cls(ci.CourseInfoLessonCreationLesson),
        unit_cls=_instance_cls(ci.CourseInfoLessonCreationLessonUnit),
        resource_cls=_instance_cls(ci.CourseInfoLessonCreationLessonResource),
        conduct_cls=_instance_cls(ci.CourseInfoLessonCreationLessonConduct),
    )
    if row is None:
        row = CourseSelectionInfoLessonCreation(
            course_instance_id=course.id, status=new_status,
            created_by_id=user_id, updated_by_id=user_id,
        )
        db.add(row)
        ci._apply_lesson_creation_data(db, row, data, **lesson_classes)
        course.course_info_lesson_creation = row
    else:
        row.status = new_status
        ci._apply_lesson_creation_data(db, row, data, **lesson_classes)
        row.updated_by_id = user_id
    _sync_instance_completion(course)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Lesson resource options + TP Link Preview (read-only, owner-agnostic)
# ---------------------------------------------------------------------------

def list_lesson_resource_options(course: CourseInstance):
    return ci.list_lesson_resource_options_for(course.course_info_resources)


def get_tp_link_preview(db: Session, course: CourseInstance):
    return ci.get_tp_link_preview_for(db, course.course_info_lesson_creation)


# ---------------------------------------------------------------------------
# Lazy seed from master (clone all 5 tabs into this instance's own tables)
# ---------------------------------------------------------------------------

def _clone_to_instance(obj, user_id: int, *, exclude_cols: frozenset[str]):
    """Recursively clone a master tab row (and its owned children) into the
    matching instance mirror classes, forcing each tab status to ``incomplete``.
    """
    mapper = sa_inspect(obj).mapper
    inst_cls = _instance_cls(type(obj))
    pk_cols = {c.name for c in mapper.primary_key}

    data: dict[str, object] = {}
    for col in mapper.columns.keys():
        if col in pk_cols or col in _AUDIT_COLS or col in exclude_cols:
            continue
        data[col] = getattr(obj, col)
    # Clone starts a fresh review cycle — reset the tab status.
    if "status" in data:
        data["status"] = "incomplete"

    new = inst_cls(**data)
    if hasattr(new, "created_by_id"):
        new.created_by_id = user_id
    if hasattr(new, "updated_by_id"):
        new.updated_by_id = user_id

    for rel in mapper.relationships:
        # Only descend into owned child rows. Plain FK references (combo-box
        # master dictionaries, the owner back-reference) are preserved via their
        # copied FK columns instead.
        if not rel.cascade.delete_orphan:
            continue
        remote_cols = frozenset(c.name for c in rel.remote_side)
        value = getattr(obj, rel.key)
        if rel.uselist:
            for child in value:
                getattr(new, rel.key).append(
                    _clone_to_instance(child, user_id, exclude_cols=remote_cols)
                )
        elif value is not None:
            setattr(
                new, rel.key,
                _clone_to_instance(value, user_id, exclude_cols=remote_cols),
            )
    return new


# (master tab relationship attr, instance tab relationship attr on CourseInstance)
_SEED_TABS: tuple[tuple[str, str], ...] = (
    ("general", "course_info_general"),
    ("personnel_requirement", "course_info_personnel_requirement"),
    ("resources", "course_info_resources"),
    ("lesson_planning", "course_info_lesson_planning"),
    ("lesson_creation", "course_info_lesson_creation"),
)


def seed_course_info_from_master(db: Session, course: CourseInstance) -> None:
    """Copy the master's Course Information into this instance on first open.

    Idempotent via ``course.course_info_seeded``. Each of the 5 tabs (and its
    typed child rows) is deep-cloned into the instance's own tables; tab
    statuses reset to ``incomplete``. Only Lesson Creation is editable here, so
    the category starts at 80% (the four inherited tabs count as complete) and
    reaches 100% once Lesson Creation is marked complete. The master's CTP
    Version is copied onto the instance's General row.
    """
    if course.course_info_seeded:
        return

    master = course.master
    if master is None:
        course.course_info_seeded = True
        db.commit()
        return

    user_id = course.updated_by_id or course.created_by_id

    for master_attr, instance_attr in _SEED_TABS:
        src = getattr(master, master_attr, None)
        if src is None:
            continue
        clone = _clone_to_instance(src, user_id, exclude_cols=frozenset({"course_master_id"}))
        clone.course_instance_id = course.id
        setattr(course, instance_attr, clone)

    # CTP Version lives on the master record but on the instance's General row.
    if course.course_info_general is not None:
        course.course_info_general.ctp_version = master.ctp_version

    course.course_info_seeded = True
    _sync_instance_completion(course)
    db.commit()


# ---------------------------------------------------------------------------
# Instance ↔ master lesson mapping
#
# The Material / Form / Evaluation categories attach their content to lessons.
# Those lessons now come from this instance's *own* cloned Lesson Creation tab
# (``course.course_info_lesson_creation``) rather than from the master. Because
# the clone copies ``order_index`` verbatim, an instance lesson maps back to the
# master lesson it was cloned from by matching ``order_index`` — used to seed the
# per-lesson content from the master and to diff it back against the master.
# ---------------------------------------------------------------------------

def instance_lessons(course: CourseInstance) -> list[CourseSelectionInfoLessonCreationLesson]:
    """This instance's own Course Information lessons, in order."""
    lesson_creation = course.course_info_lesson_creation
    if lesson_creation is None:
        return []
    return list(lesson_creation.lessons)


def get_lesson_associations(db: Session, course: CourseInstance, lesson_id: int):
    """Count how many instance Material / Form Builder / Evaluation records
    reference the given instance lesson.

    Mirrors :func:`app.modules.course_info.services.get_lesson_associations` but
    over the instance-scoped tables. There is no per-instance Schedule category,
    so ``schedule`` is always 0. 404s if the lesson isn't part of this instance.
    """
    from sqlalchemy import func, select

    from app.modules.course_info.schemas import LessonAssociationsResponse
    from app.modules.course_selection_evaluation.models import (
        CourseSelectionEvaluationLessonForm,
        CourseSelectionEvaluationLessonQuiz,
    )
    from app.modules.course_selection_form.models import (
        CourseSelectionFormFormLink,
        CourseSelectionFormSurveyLink,
    )
    from app.modules.course_selection_material.models import (
        CourseSelectionMaterialFile,
        CourseSelectionMaterialFolder,
    )

    valid_ids = {lesson.id for lesson in instance_lessons(course)}
    if lesson_id not in valid_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson not found for this course",
        )

    def _count(model) -> int:
        return int(
            db.execute(
                select(func.count(model.id)).where(model.lesson_id == lesson_id)
            ).scalar_one()
            or 0
        )

    material = _count(CourseSelectionMaterialFile) + _count(CourseSelectionMaterialFolder)
    form_builder = _count(CourseSelectionFormSurveyLink) + _count(CourseSelectionFormFormLink)
    evaluation = _count(CourseSelectionEvaluationLessonQuiz) + _count(CourseSelectionEvaluationLessonForm)

    return LessonAssociationsResponse(
        material=material,
        formBuilder=form_builder,
        evaluation=evaluation,
        schedule=0,
        total=material + form_builder + evaluation,
    )


def _master_lessons(course: CourseInstance):
    master = course.master
    if master is None or master.lesson_creation is None:
        return []
    return list(master.lesson_creation.lessons)


def master_to_instance_lesson_ids(course: CourseInstance) -> dict[int, int]:
    """Map each master lesson id to the instance lesson cloned from it.

    Correspondence is by ``order_index`` (copied verbatim during the clone)."""
    inst_by_order = {l.order_index: l.id for l in instance_lessons(course)}
    return {
        m.id: inst_by_order[m.order_index]
        for m in _master_lessons(course)
        if m.order_index in inst_by_order
    }


def instance_to_master_lesson_ids(course: CourseInstance) -> dict[int, int]:
    """Inverse of :func:`master_to_instance_lesson_ids` — used to line an
    instance's per-lesson content back up with the master for diffing."""
    return {inst_id: m_id for m_id, inst_id in master_to_instance_lesson_ids(course).items()}


# ---------------------------------------------------------------------------
# Modification tracking (instance content vs the master it was cloned from)
# ---------------------------------------------------------------------------

def _normalize_general(data: GeneralInformationData | None) -> GeneralInformationData | None:
    # The instance title legitimately differs from the master — exclude it.
    if data is None:
        return None
    return data.model_copy(update={"courseTitle": None})


def _normalize_lesson_creation(data: LessonCreationData | None) -> LessonCreationData | None:
    # Lesson PK ids differ between master and instance copies — strip them so
    # only the logical content is compared.
    if data is None:
        return None
    return data.model_copy(
        update={"lessons": [lesson.model_copy(update={"id": None}) for lesson in data.lessons]}
    )


def course_info_modified(db: Session, course: CourseInstance) -> bool:
    """True when this instance's Course Information content differs from the
    master it was cloned from. Compares field data + child rows, ignoring tab
    ``status`` (already excluded by the serializers), the course title, and
    lesson PK ids."""
    if not course.course_info_seeded:
        return False
    master = course.master
    if master is None:
        return False

    if _normalize_general(ci.get_general_tab(master)[1]) != _normalize_general(get_general_tab(course)[1]):
        return True
    if ci.get_personnel_requirement_tab(master)[1] != get_personnel_requirement_tab(course)[1]:
        return True
    if ci.get_resources_tab(master)[1] != get_resources_tab(course)[1]:
        return True
    if ci.get_lesson_planning_tab(master)[1] != get_lesson_planning_tab(course)[1]:
        return True
    if _normalize_lesson_creation(ci.get_lesson_creation_tab(master)[1]) != _normalize_lesson_creation(
        get_lesson_creation_tab(course)[1]
    ):
        return True
    return False


def lesson_creation_modified_lessons(course: CourseInstance) -> set[int]:
    """Instance Lesson Creation lesson ids whose content differs from the master
    lesson they were cloned from.

    Correspondence is by ``order_index`` (copied verbatim during the clone), the
    same key used by :func:`master_to_instance_lesson_ids`. Lesson content is
    compared with PK ids stripped so only logical fields (plus child units /
    resources / conducts) count — mirrors the whole-tab check in
    :func:`course_info_modified`. A lesson with no master counterpart (added on
    the instance, or the master lesson removed) counts as modified."""
    if not course.course_info_seeded:
        return set()
    master = course.master
    inst_row = course.course_info_lesson_creation
    if master is None or master.lesson_creation is None or inst_row is None:
        return set()

    def _content_by_order(row) -> dict[int, object]:
        # ``_lesson_creation_to_data`` serialises lessons in ``row.lessons``
        # order, so zipping the two lines each serialized item up with its
        # source row (for its ``order_index``).
        data = ci._lesson_creation_to_data(row)
        return {
            lesson.order_index: item.model_copy(update={"id": None})
            for lesson, item in zip(row.lessons, data.lessons)
        }

    master_by_order = _content_by_order(master.lesson_creation)
    inst_data = ci._lesson_creation_to_data(inst_row)
    modified: set[int] = set()
    for lesson, item in zip(inst_row.lessons, inst_data.lessons):
        if master_by_order.get(lesson.order_index) != item.model_copy(update={"id": None}):
            modified.add(lesson.id)
    return modified
