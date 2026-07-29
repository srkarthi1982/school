from __future__ import annotations

import logging
from collections import defaultdict
from typing import TYPE_CHECKING

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.course.models import CourseInstance
from app.modules.course_selection_info import services as csinfo
from app.modules.form.models import Form
from app.modules.form_builder.models import FormBuilderFormLink, FormBuilderSurveyLink
from app.modules.course_selection_form.models import (
    CourseSelectionFormFormLink,
    CourseSelectionFormSurveyLink,
)
from app.modules.course_selection_form.schemas import (
    FormBuilderFormResponse,
    FormBuilderLessonResponse,
    FormBuilderResponse,
    FormBuilderSurveyResponse,
)
from app.modules.survey.models import Survey

if TYPE_CHECKING:
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreationLesson,
    )

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Form (per course instance)
#
# A course instance *is* its form builder: ``course_instances.title`` is the
# title and the binary completion state lives in
# ``course_instances.surveys_completion`` (100/0). The survey/form links hang off
# ``course_instance_id``. The ``form_builder_id`` parameter name is preserved for
# symmetry with the master module, but its value is the course instance id.
# ---------------------------------------------------------------------------

def get_or_raise_course(db: Session, course_instance_id: int) -> CourseInstance:
    course = db.get(CourseInstance, course_instance_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Form not found"
        )
    return course


def form_builder_status_of(course: CourseInstance) -> str:
    return "complete" if course.surveys_completion >= 100 else "incomplete"


def set_form_builder_status(
    db: Session, course: CourseInstance, new_status: str, user_id: int
) -> CourseInstance:
    if new_status not in ("incomplete", "complete"):
        raise HTTPException(
            status_code=400, detail="status must be 'incomplete' or 'complete'"
        )
    if (
        new_status != "complete"
        and course.surveys_completion >= 100
        and course.status == "approved"
    ):
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    course.surveys_completion = 100 if new_status == "complete" else 0
    course.updated_by_id = user_id
    db.commit()
    db.refresh(course)
    return course


# ---------------------------------------------------------------------------
# Lazy seed from master
# ---------------------------------------------------------------------------

def seed_from_master(db: Session, course: CourseInstance) -> None:
    """Copy the master's survey/form links into this instance on first open.

    Idempotent via ``course.surveys_seeded``. Surveys/forms are global records, so
    only the link rows are copied (keeping ``survey_id``/``form_id`` and
    ``order_index``); each link's ``lesson_id`` is re-pointed at this instance's
    own cloned lesson. Thereafter the instance's links are edited independently.
    """
    if course.surveys_seeded:
        return

    # Course Information (incl. the lessons we attach to) must exist on the
    # instance before its master lesson links can be re-pointed.
    csinfo.seed_course_info_from_master(db, course)
    lesson_map = csinfo.master_to_instance_lesson_ids(course)

    def _instance_lesson(master_lesson_id):
        return None if master_lesson_id is None else lesson_map.get(master_lesson_id)

    master_id = course.master_id

    for link in (
        db.query(FormBuilderSurveyLink)
        .filter(FormBuilderSurveyLink.course_master_id == master_id)
        .all()
    ):
        db.add(
            CourseSelectionFormSurveyLink(
                course_instance_id=course.id,
                lesson_id=_instance_lesson(link.lesson_id),
                survey_id=link.survey_id,
                order_index=link.order_index,
            )
        )
    for link in (
        db.query(FormBuilderFormLink)
        .filter(FormBuilderFormLink.course_master_id == master_id)
        .all()
    ):
        db.add(
            CourseSelectionFormFormLink(
                course_instance_id=course.id,
                lesson_id=_instance_lesson(link.lesson_id),
                form_id=link.form_id,
                order_index=link.order_index,
            )
        )

    course.surveys_seeded = True
    db.commit()


# ---------------------------------------------------------------------------
# Modification tracking (instance links vs the master it was seeded from)
#
# Surveys/forms are global records, so only the *set* of associated ids (per
# lesson bucket, ``None`` = whole-course scope) is compared. Order is ignored.
# ---------------------------------------------------------------------------

def form_modified_lessons(db: Session, course: CourseInstance) -> set[int | None]:
    """Lesson buckets whose survey/form links differ from the master."""
    if not course.surveys_seeded:
        return set()

    def grouped(model, owner_field: str, owner_id: int, id_field: str) -> dict[int | None, frozenset]:
        rows = db.execute(
            select(getattr(model, "lesson_id"), getattr(model, id_field)).where(
                getattr(model, owner_field) == owner_id
            )
        ).all()
        acc: dict[int | None, set] = defaultdict(set)
        for lesson_id, ref_id in rows:
            acc[lesson_id].add(ref_id)
        return {k: frozenset(v) for k, v in acc.items()}

    master_surv = grouped(FormBuilderSurveyLink, "course_master_id", course.master_id, "survey_id")
    master_form = grouped(FormBuilderFormLink, "course_master_id", course.master_id, "form_id")
    inst_surv = grouped(CourseSelectionFormSurveyLink, "course_instance_id", course.id, "survey_id")
    inst_form = grouped(CourseSelectionFormFormLink, "course_instance_id", course.id, "form_id")

    # Instance links are keyed by this instance's own lesson ids; the master's by
    # master lesson ids. Compare each instance lesson bucket (plus the
    # course-scope ``None`` bucket) against the master lesson it was cloned from.
    i2m = csinfo.instance_to_master_lesson_ids(course)

    def master_bucket(grouped_master, inst_key):
        if inst_key is None:
            return grouped_master.get(None, frozenset())
        master_id = i2m.get(inst_key)
        return grouped_master.get(master_id, frozenset()) if master_id is not None else frozenset()

    modified: set[int | None] = set()
    for key in {lesson.id for lesson in csinfo.instance_lessons(course)} | {None}:
        if (
            inst_surv.get(key, frozenset()) != master_bucket(master_surv, key)
            or inst_form.get(key, frozenset()) != master_bucket(master_form, key)
        ):
            modified.add(key)
    return modified


def form_modified(db: Session, course: CourseInstance) -> bool:
    """True when any of this instance's survey/form links differ from the master."""
    return bool(form_modified_lessons(db, course))


# ---------------------------------------------------------------------------
# Lessons (sourced from this instance's own Course Information → Lesson Creation)
# ---------------------------------------------------------------------------

def _course_info_lessons(
    course: CourseInstance,
) -> list[CourseSelectionInfoLessonCreationLesson]:
    return csinfo.instance_lessons(course)


def _validate_lesson_for_course(course: CourseInstance, lesson_id: int) -> None:
    valid_ids = {lesson.id for lesson in _course_info_lessons(course)}
    if lesson_id not in valid_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson not found for this course",
        )


def list_form_builder_lessons(
    db: Session, course: CourseInstance
) -> list[FormBuilderLessonResponse]:
    lessons = _course_info_lessons(course)
    if not lessons:
        return []
    survey_counts = dict(
        db.execute(
            select(
                CourseSelectionFormSurveyLink.lesson_id,
                func.count(CourseSelectionFormSurveyLink.id),
            )
            .where(
                CourseSelectionFormSurveyLink.course_instance_id == course.id,
                CourseSelectionFormSurveyLink.lesson_id.is_not(None),
            )
            .group_by(CourseSelectionFormSurveyLink.lesson_id)
        ).all()
    )
    form_counts = dict(
        db.execute(
            select(
                CourseSelectionFormFormLink.lesson_id,
                func.count(CourseSelectionFormFormLink.id),
            )
            .where(
                CourseSelectionFormFormLink.course_instance_id == course.id,
                CourseSelectionFormFormLink.lesson_id.is_not(None),
            )
            .group_by(CourseSelectionFormFormLink.lesson_id)
        ).all()
    )
    modified = form_modified_lessons(db, course)
    return [
        FormBuilderLessonResponse(
            id=lesson.id,
            lesson_number=lesson.lesson_number,
            lesson_title=lesson.lesson_title,
            order_index=lesson.order_index,
            survey_count=int(survey_counts.get(lesson.id, 0)),
            form_count=int(form_counts.get(lesson.id, 0)),
            modified=lesson.id in modified,
        )
        for lesson in lessons
    ]


# ---------------------------------------------------------------------------
# Survey links (lesson ↔ survey, or course ↔ survey when lesson_id is None)
# ---------------------------------------------------------------------------

def _serialize_link(link: CourseSelectionFormSurveyLink) -> FormBuilderSurveyResponse:
    survey = link.survey
    return FormBuilderSurveyResponse(
        id=link.id,
        survey_id=link.survey_id,
        lesson_id=link.lesson_id,
        title=survey.title if survey else "",
        description=survey.description if survey else None,
        status=survey.status if survey else "",
        question_count=len(survey.questions) if survey else 0,
        order_index=link.order_index,
        created_at=link.created_at,
    )


def list_survey_links(
    db: Session, course: CourseInstance, lesson_id: int | None
) -> list[FormBuilderSurveyResponse]:
    if lesson_id is not None:
        _validate_lesson_for_course(course, lesson_id)
        lesson_filter = CourseSelectionFormSurveyLink.lesson_id == lesson_id
    else:
        lesson_filter = CourseSelectionFormSurveyLink.lesson_id.is_(None)
    stmt = (
        select(CourseSelectionFormSurveyLink)
        .where(
            CourseSelectionFormSurveyLink.course_instance_id == course.id,
            lesson_filter,
        )
        .order_by(CourseSelectionFormSurveyLink.order_index, CourseSelectionFormSurveyLink.id)
    )
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_link(row) for row in rows]


def list_all_survey_links(
    db: Session, course: CourseInstance
) -> list[FormBuilderSurveyResponse]:
    """All survey links for this course instance, across every lesson and the
    course itself (lesson_id IS NULL), ordered by lesson then position."""
    stmt = (
        select(CourseSelectionFormSurveyLink)
        .where(CourseSelectionFormSurveyLink.course_instance_id == course.id)
        .order_by(
            CourseSelectionFormSurveyLink.lesson_id.nulls_first(),
            CourseSelectionFormSurveyLink.order_index,
            CourseSelectionFormSurveyLink.id,
        )
    )
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_link(row) for row in rows]


def associate_survey(
    db: Session, course: CourseInstance, lesson_id: int | None, survey_id: int
) -> FormBuilderSurveyResponse:
    if lesson_id is not None:
        _validate_lesson_for_course(course, lesson_id)

    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    if lesson_id is not None:
        lesson_filter = CourseSelectionFormSurveyLink.lesson_id == lesson_id
    else:
        lesson_filter = CourseSelectionFormSurveyLink.lesson_id.is_(None)

    existing = db.execute(
        select(CourseSelectionFormSurveyLink.id).where(
            CourseSelectionFormSurveyLink.course_instance_id == course.id,
            lesson_filter,
            CourseSelectionFormSurveyLink.survey_id == survey_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This survey is already associated here",
        )

    next_index = (
        db.execute(
            select(func.coalesce(func.max(CourseSelectionFormSurveyLink.order_index), -1) + 1)
            .where(
                CourseSelectionFormSurveyLink.course_instance_id == course.id,
                lesson_filter,
            )
        ).scalar()
        or 0
    )

    link = CourseSelectionFormSurveyLink(
        course_instance_id=course.id,
        lesson_id=lesson_id,
        survey_id=survey_id,
        order_index=int(next_index),
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This survey is already associated here",
        )
    db.refresh(link)
    return _serialize_link(link)


def dissociate_survey(db: Session, link_id: int) -> None:
    link = db.get(CourseSelectionFormSurveyLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Association not found")
    db.delete(link)
    db.commit()


# ---------------------------------------------------------------------------
# Form links (lesson ↔ form, or course ↔ form when lesson_id is None)
# ---------------------------------------------------------------------------

def _serialize_form_link(link: CourseSelectionFormFormLink) -> FormBuilderFormResponse:
    form = link.form
    return FormBuilderFormResponse(
        id=link.id,
        form_id=link.form_id,
        lesson_id=link.lesson_id,
        title=form.title if form else "",
        description=form.description if form else None,
        status=form.status if form else "",
        question_count=len(form.questions) if form else 0,
        order_index=link.order_index,
        created_at=link.created_at,
    )


def list_form_links(
    db: Session, course: CourseInstance, lesson_id: int | None
) -> list[FormBuilderFormResponse]:
    if lesson_id is not None:
        _validate_lesson_for_course(course, lesson_id)
        lesson_filter = CourseSelectionFormFormLink.lesson_id == lesson_id
    else:
        lesson_filter = CourseSelectionFormFormLink.lesson_id.is_(None)
    stmt = (
        select(CourseSelectionFormFormLink)
        .where(
            CourseSelectionFormFormLink.course_instance_id == course.id,
            lesson_filter,
        )
        .order_by(CourseSelectionFormFormLink.order_index, CourseSelectionFormFormLink.id)
    )
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_form_link(row) for row in rows]


def list_all_form_links(
    db: Session, course: CourseInstance
) -> list[FormBuilderFormResponse]:
    """All form links for this course instance, across every lesson and the
    course itself (lesson_id IS NULL), ordered by lesson then position."""
    stmt = (
        select(CourseSelectionFormFormLink)
        .where(CourseSelectionFormFormLink.course_instance_id == course.id)
        .order_by(
            CourseSelectionFormFormLink.lesson_id.nulls_first(),
            CourseSelectionFormFormLink.order_index,
            CourseSelectionFormFormLink.id,
        )
    )
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_form_link(row) for row in rows]


def associate_form(
    db: Session, course: CourseInstance, lesson_id: int | None, form_id: int
) -> FormBuilderFormResponse:
    if lesson_id is not None:
        _validate_lesson_for_course(course, lesson_id)

    form = db.get(Form, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if lesson_id is not None:
        lesson_filter = CourseSelectionFormFormLink.lesson_id == lesson_id
    else:
        lesson_filter = CourseSelectionFormFormLink.lesson_id.is_(None)

    existing = db.execute(
        select(CourseSelectionFormFormLink.id).where(
            CourseSelectionFormFormLink.course_instance_id == course.id,
            lesson_filter,
            CourseSelectionFormFormLink.form_id == form_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This form is already associated here",
        )

    # Cross-category guard: a form already attached to this lesson via the
    # Evaluation category would surface twice on the lesson, so block it here.
    from app.modules.course_selection_evaluation.models import (
        CourseSelectionEvaluationLessonForm,
    )

    ev_lesson_filter = (
        CourseSelectionEvaluationLessonForm.lesson_id == lesson_id
        if lesson_id is not None
        else CourseSelectionEvaluationLessonForm.lesson_id.is_(None)
    )
    cross = db.execute(
        select(CourseSelectionEvaluationLessonForm.id).where(
            CourseSelectionEvaluationLessonForm.course_instance_id == course.id,
            ev_lesson_filter,
            CourseSelectionEvaluationLessonForm.form_id == form_id,
        )
    ).first()
    if cross:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This form is already attached to this lesson via Evaluation.",
        )

    next_index = (
        db.execute(
            select(func.coalesce(func.max(CourseSelectionFormFormLink.order_index), -1) + 1)
            .where(
                CourseSelectionFormFormLink.course_instance_id == course.id,
                lesson_filter,
            )
        ).scalar()
        or 0
    )

    link = CourseSelectionFormFormLink(
        course_instance_id=course.id,
        lesson_id=lesson_id,
        form_id=form_id,
        order_index=int(next_index),
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This form is already associated here",
        )
    db.refresh(link)
    return _serialize_form_link(link)


def dissociate_form(db: Session, link_id: int) -> None:
    link = db.get(CourseSelectionFormFormLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Association not found")
    db.delete(link)
    db.commit()


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def serialize_form_builder(
    course: CourseInstance, db: Session | None = None
) -> FormBuilderResponse:
    modified = form_modified_lessons(db, course) if db is not None else set()
    return FormBuilderResponse(
        id=course.id,
        course_instance_id=course.id,
        title=course.title,
        status=form_builder_status_of(course),
        course_status=course.status,
        surveys_completion=course.surveys_completion,
        modified=bool(modified),
        course_modified=None in modified,
    )
