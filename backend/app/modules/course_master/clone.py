"""Deep-clone a CourseMaster and every relation hanging off it.

Cloning a course master duplicates the whole template tree: the five Course
Information tabs (and their typed child rows), Material folders/files, Form
Builder survey/form links, Evaluation lesson↔quiz associations and the
Schedule days/placements.

Two kinds of internal references have to be *remapped* rather than copied
verbatim, because the rows they point at get new primary keys in the clone:

* ``lesson_id`` — Material, Form Builder, Evaluation and Schedule all reference
  ``course_info_lesson_creation_lessons.id``. We build an old→new lesson id map
  while cloning Lesson Creation and translate every ``lesson_id`` through it.
* Material folder ``parent_id`` / file ``folder_id`` — the folder tree gets new
  (UUID) keys, so parent/folder links are rewired via the folder object map.

The clone is always reset to a pristine *draft*: the master's status is
``draft``, all five completion columns are 0, and every Course Information tab
row's ``status`` is forced back to ``incomplete`` (course-info completion is
derived from tab statuses, so this is what makes the category read 0%).
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.modules.course_info.models import CourseInfoLessonCreationLesson
from app.modules.evaluation.models import EvaluationLessonQuiz
from app.modules.form_builder.models import FormBuilderFormLink, FormBuilderSurveyLink
from app.modules.material.models import MaterialFile, MaterialFolder
from app.modules.material.services import logger, storage as material_storage
from app.modules.schedule.models import CourseScheduleDay, CourseSchedulePlacement

from .models import CourseMaster

# Columns that must never be copied straight across: primary keys are handled
# separately, audit/timestamp columns are re-stamped for the current user.
_AUDIT_COLS = frozenset({"created_at", "updated_at", "created_by_id", "updated_by_id"})

# The five Course Information tab relationships hanging off the master. Cloning
# these (with their nested cascade children) covers the whole Course
# Information category.
_COURSE_INFO_TABS = (
    "general",
    "personnel_requirement",
    "resources",
    "lesson_planning",
    "lesson_creation",
)


def _clone_subtree(
    obj,
    *,
    exclude_cols: frozenset[str],
    user_id: int,
    lesson_pairs: list[tuple[CourseInfoLessonCreationLesson, CourseInfoLessonCreationLesson]],
):
    """Recursively clone ``obj`` and its owned (delete-orphan) child rows.

    ``exclude_cols`` are columns NOT to copy — used to drop the FK that points
    back at the parent, since that link is re-established via the relationship.
    Newly cloned Lesson Creation lessons are recorded in ``lesson_pairs`` so the
    caller can build the old→new lesson id map after the flush.
    """
    mapper = sa_inspect(obj).mapper
    pk_cols = {c.name for c in mapper.primary_key}

    data: dict[str, object] = {}
    for col in mapper.columns.keys():
        if col in pk_cols or col in _AUDIT_COLS or col in exclude_cols:
            continue
        data[col] = getattr(obj, col)

    # Course Information tab rows carry a per-tab completion status; the clone
    # starts from scratch, so force it back to incomplete.
    if "status" in data:
        data["status"] = "incomplete"

    new = type(obj)(**data)
    if hasattr(new, "created_by_id"):
        new.created_by_id = user_id
    if hasattr(new, "updated_by_id"):
        new.updated_by_id = user_id

    if isinstance(obj, CourseInfoLessonCreationLesson):
        lesson_pairs.append((obj, new))

    for rel in mapper.relationships:
        # Only descend into child rows we own. Plain FK references (e.g. a
        # picklist master row) are not cascade-delete-orphan and are preserved
        # via their copied FK column instead.
        if not rel.cascade.delete_orphan:
            continue
        remote_cols = frozenset(c.name for c in rel.remote_side)
        value = getattr(obj, rel.key)
        if rel.uselist:
            for child in value:
                getattr(new, rel.key).append(
                    _clone_subtree(
                        child,
                        exclude_cols=remote_cols,
                        user_id=user_id,
                        lesson_pairs=lesson_pairs,
                    )
                )
        elif value is not None:
            setattr(
                new,
                rel.key,
                _clone_subtree(
                    value,
                    exclude_cols=remote_cols,
                    user_id=user_id,
                    lesson_pairs=lesson_pairs,
                ),
            )
    return new


def _clone_material(
    db: Session,
    source_id: int,
    new_id: int,
    lesson_map: dict[int, int],
    user_id: int,
) -> None:
    """Clone Material folders and files, rewiring folder tree + lesson links.

    Physical file bytes are copied to fresh storage keys so the clone is fully
    independent of the source (deleting one course's files won't break the
    other).
    """
    folders = (
        db.query(MaterialFolder)
        .filter(MaterialFolder.course_master_id == source_id)
        .all()
    )
    folder_map: dict = {}
    for folder in folders:
        clone = MaterialFolder(
            course_master_id=new_id,
            name=folder.name,
            lesson_id=lesson_map.get(folder.lesson_id) if folder.lesson_id else None,
            created_by_id=user_id,
        )
        folder_map[folder.id] = clone
        db.add(clone)
    # Second pass: rewire parent links now that every clone exists.
    for folder in folders:
        if folder.parent_id:
            folder_map[folder.id].parent = folder_map[folder.parent_id]

    files = (
        db.query(MaterialFile)
        .filter(MaterialFile.course_master_id == source_id)
        .all()
    )
    for file in files:
        storage_key, thumbnail_key = file.storage_key, file.thumbnail_key
        try:
            blob = material_storage.read(file.storage_key)
            storage_key, thumbnail_key = material_storage.save(
                blob, file.filename, file.content_type
            )
        except Exception:
            # If the source blob is missing/unreadable, fall back to sharing the
            # original keys rather than failing the whole clone.
            logger.exception(
                "Failed to copy material blob %s during course clone", file.storage_key
            )
        clone = MaterialFile(
            course_master_id=new_id,
            folder_id=None,
            lesson_id=lesson_map.get(file.lesson_id) if file.lesson_id else None,
            uploader_id=user_id,
            filename=file.filename,
            content_type=file.content_type,
            file_size=file.file_size,
            storage_key=storage_key,
            thumbnail_key=thumbnail_key,
        )
        if file.folder_id:
            clone.folder = folder_map[file.folder_id]
        db.add(clone)


def _clone_form_builder(
    db: Session, source_id: int, new_id: int, lesson_map: dict[int, int]
) -> None:
    for link in (
        db.query(FormBuilderSurveyLink)
        .filter(FormBuilderSurveyLink.course_master_id == source_id)
        .all()
    ):
        db.add(
            FormBuilderSurveyLink(
                course_master_id=new_id,
                lesson_id=lesson_map.get(link.lesson_id) if link.lesson_id else None,
                survey_id=link.survey_id,
                order_index=link.order_index,
            )
        )
    for link in (
        db.query(FormBuilderFormLink)
        .filter(FormBuilderFormLink.course_master_id == source_id)
        .all()
    ):
        db.add(
            FormBuilderFormLink(
                course_master_id=new_id,
                lesson_id=lesson_map.get(link.lesson_id) if link.lesson_id else None,
                form_id=link.form_id,
                order_index=link.order_index,
            )
        )


def _clone_evaluation(
    db: Session, source_id: int, new_id: int, lesson_map: dict[int, int]
) -> None:
    for quiz in (
        db.query(EvaluationLessonQuiz)
        .filter(EvaluationLessonQuiz.course_master_id == source_id)
        .all()
    ):
        db.add(
            EvaluationLessonQuiz(
                course_master_id=new_id,
                lesson_id=lesson_map.get(quiz.lesson_id) if quiz.lesson_id else None,
                quiz_id=quiz.quiz_id,
                order_index=quiz.order_index,
                assessment_type=quiz.assessment_type,
                max_mark=quiz.max_mark,
                pass_mark=quiz.pass_mark,
                pass_percentage=quiz.pass_percentage,
                percentage_allocation=quiz.percentage_allocation,
            )
        )


def _clone_schedule(
    db: Session, source_id: int, new_id: int, lesson_map: dict[int, int]
) -> None:
    days = (
        db.query(CourseScheduleDay)
        .filter(CourseScheduleDay.course_master_id == source_id)
        .all()
    )
    for day in days:
        new_day = CourseScheduleDay(
            course_master_id=new_id,
            order_index=day.order_index,
            day_label=day.day_label,
        )
        for placement in day.placements:
            mapped_lesson = lesson_map.get(placement.lesson_id)
            # Placements require a valid lesson; skip any orphan that can't be
            # remapped rather than insert a dangling FK.
            if mapped_lesson is None:
                continue
            new_day.placements.append(
                CourseSchedulePlacement(
                    lesson_id=mapped_lesson,
                    order_index=placement.order_index,
                    start_col=placement.start_col,
                    span=placement.span,
                    description=placement.description,
                    remarks=placement.remarks,
                )
            )
        db.add(new_day)


def clone_master(
    db: Session,
    source: CourseMaster,
    *,
    title: str,
    ctp_version: str | None,
    course_date: date | None,
    user_id: int,
) -> CourseMaster:
    """Deep-clone ``source`` into a fresh draft master and return it.

    The new master and all its relations are added to ``db`` and flushed, but
    the caller is responsible for committing the transaction.
    """
    new_master = CourseMaster(
        title=title,
        ctp_version=ctp_version,
        course_date=course_date,
        status="draft",
        course_info_completion=0,
        material_completion=0,
        surveys_completion=0,
        evaluation_completion=0,
        schedule_completion=0,
        created_by_id=user_id,
        updated_by_id=user_id,
    )
    db.add(new_master)
    db.flush()  # assign new_master.id

    # 1) Course Information tabs (+ nested typed child rows). Capture cloned
    #    lessons so we can remap lesson_id references afterwards.
    lesson_pairs: list[
        tuple[CourseInfoLessonCreationLesson, CourseInfoLessonCreationLesson]
    ] = []
    for tab in _COURSE_INFO_TABS:
        src_tab = getattr(source, tab)
        if src_tab is not None:
            setattr(
                new_master,
                tab,
                _clone_subtree(
                    src_tab,
                    exclude_cols=frozenset({"course_master_id"}),
                    user_id=user_id,
                    lesson_pairs=lesson_pairs,
                ),
            )
    db.flush()  # assign ids for tabs, lessons and all child rows

    lesson_map = {old.id: new.id for old, new in lesson_pairs}

    # 2) Cross-module relations keyed off the master / lessons.
    _clone_material(db, source.id, new_master.id, lesson_map, user_id)
    _clone_form_builder(db, source.id, new_master.id, lesson_map)
    _clone_evaluation(db, source.id, new_master.id, lesson_map)
    _clone_schedule(db, source.id, new_master.id, lesson_map)

    db.flush()
    return new_master
