from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.course_master.models import CourseMaster
from app.modules.form.models import Form
from app.modules.form_builder.models import (
    FormBuilderFormLink,
    FormBuilderSurveyLink,
)
from app.modules.form_builder.schemas import (
    FormBuilderFormResponse,
    FormBuilderLessonResponse,
    FormBuilderResponse,
    FormBuilderSurveyResponse,
)
from app.modules.survey.models import Survey

if TYPE_CHECKING:
    from app.modules.course_info.models import CourseInfoLessonCreationLesson

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Form Builder (per course master)
#
# The Form Builder category no longer has its own table. A course master *is*
# its form builder: ``course_masters.title`` is the title, and the binary
# completion state lives directly in ``course_masters.surveys_completion``
# (100/0, the legacy "surveys" column). The survey/form links hang off
# ``course_master_id``. Throughout this module the ``form_builder_id`` parameter
# name is preserved for API stability, but its value is the course master id.
# ---------------------------------------------------------------------------

def get_or_raise_master(db: Session, course_master_id: int) -> CourseMaster:
    master = db.get(CourseMaster, course_master_id)
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Form Builder not found"
        )
    return master


def form_builder_status_of(master: CourseMaster) -> str:
    """Derive the binary form-builder status from the master's completion column."""
    return "complete" if master.surveys_completion >= 100 else "incomplete"


def set_form_builder_status(
    db: Session, master: CourseMaster, new_status: str, user_id: int
) -> CourseMaster:
    if new_status not in ("incomplete", "complete"):
        raise HTTPException(
            status_code=400, detail="status must be 'incomplete' or 'complete'"
        )
    if (
        new_status != "complete"
        and master.surveys_completion >= 100
        and master.status == "approved"
    ):
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    # Mirror the binary status into the course master's progress column. The
    # Form Builder category keeps the legacy ``surveys_completion`` field.
    master.surveys_completion = 100 if new_status == "complete" else 0
    master.updated_by_id = user_id
    db.commit()
    db.refresh(master)
    return master


# ---------------------------------------------------------------------------
# Lessons (sourced from Course Information → Lesson Creation)
# ---------------------------------------------------------------------------

def _course_info_lessons(
    master: CourseMaster,
) -> list[CourseInfoLessonCreationLesson]:
    """Return the lessons defined for this course master, in order."""
    lesson_creation = master.lesson_creation
    if lesson_creation is None:
        return []
    return list(lesson_creation.lessons)


def _validate_lesson_for_master(
    master: CourseMaster, lesson_id: int
) -> None:
    """Ensure ``lesson_id`` belongs to this course master."""
    valid_ids = {lesson.id for lesson in _course_info_lessons(master)}
    if lesson_id not in valid_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson not found for this course",
        )


def list_form_builder_lessons(
    db: Session, master: CourseMaster
) -> list[FormBuilderLessonResponse]:
    lessons = _course_info_lessons(master)
    if not lessons:
        return []
    survey_counts = dict(
        db.execute(
            select(
                FormBuilderSurveyLink.lesson_id,
                func.count(FormBuilderSurveyLink.id),
            )
            .where(
                FormBuilderSurveyLink.course_master_id == master.id,
                FormBuilderSurveyLink.lesson_id.is_not(None),
            )
            .group_by(FormBuilderSurveyLink.lesson_id)
        ).all()
    )
    form_counts = dict(
        db.execute(
            select(
                FormBuilderFormLink.lesson_id,
                func.count(FormBuilderFormLink.id),
            )
            .where(
                FormBuilderFormLink.course_master_id == master.id,
                FormBuilderFormLink.lesson_id.is_not(None),
            )
            .group_by(FormBuilderFormLink.lesson_id)
        ).all()
    )
    return [
        FormBuilderLessonResponse(
            id=lesson.id,
            lesson_number=lesson.lesson_number,
            lesson_title=lesson.lesson_title,
            order_index=lesson.order_index,
            survey_count=int(survey_counts.get(lesson.id, 0)),
            form_count=int(form_counts.get(lesson.id, 0)),
        )
        for lesson in lessons
    ]


def count_course_level_surveys(db: Session, master: CourseMaster) -> int:
    """Number of surveys associated with the course itself (lesson_id IS NULL)."""
    return int(
        db.execute(
            select(func.count(FormBuilderSurveyLink.id)).where(
                FormBuilderSurveyLink.course_master_id == master.id,
                FormBuilderSurveyLink.lesson_id.is_(None),
            )
        ).scalar()
        or 0
    )


# ---------------------------------------------------------------------------
# Survey links (lesson ↔ survey, or course ↔ survey when lesson_id is None)
# ---------------------------------------------------------------------------

def _serialize_link(link: FormBuilderSurveyLink) -> FormBuilderSurveyResponse:
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
    db: Session, master: CourseMaster, lesson_id: int | None
) -> list[FormBuilderSurveyResponse]:
    if lesson_id is not None:
        _validate_lesson_for_master(master, lesson_id)
        lesson_filter = FormBuilderSurveyLink.lesson_id == lesson_id
    else:
        lesson_filter = FormBuilderSurveyLink.lesson_id.is_(None)
    stmt = (
        select(FormBuilderSurveyLink)
        .where(
            FormBuilderSurveyLink.course_master_id == master.id,
            lesson_filter,
        )
        .order_by(FormBuilderSurveyLink.order_index, FormBuilderSurveyLink.id)
    )
    # Survey eager-loads collection relationships (lazy="joined"), so the result
    # must be de-duplicated with unique() before materialising.
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_link(row) for row in rows]


def list_all_survey_links(
    db: Session, master: CourseMaster
) -> list[FormBuilderSurveyResponse]:
    """All survey links for this course master, across every lesson and the
    course itself (lesson_id IS NULL), ordered by lesson then position."""
    stmt = (
        select(FormBuilderSurveyLink)
        .where(FormBuilderSurveyLink.course_master_id == master.id)
        .order_by(
            FormBuilderSurveyLink.lesson_id.nulls_first(),
            FormBuilderSurveyLink.order_index,
            FormBuilderSurveyLink.id,
        )
    )
    # Survey eager-loads collection relationships (lazy="joined"), so the result
    # must be de-duplicated with unique() before materialising.
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_link(row) for row in rows]


def associate_survey(
    db: Session, master: CourseMaster, lesson_id: int | None, survey_id: int
) -> FormBuilderSurveyResponse:
    if lesson_id is not None:
        _validate_lesson_for_master(master, lesson_id)

    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    if lesson_id is not None:
        lesson_filter = FormBuilderSurveyLink.lesson_id == lesson_id
    else:
        lesson_filter = FormBuilderSurveyLink.lesson_id.is_(None)

    # The DB unique constraint does not catch duplicate course-level links
    # (NULL lesson_id is distinct per row in Postgres), so guard explicitly.
    existing = db.execute(
        select(FormBuilderSurveyLink.id).where(
            FormBuilderSurveyLink.course_master_id == master.id,
            lesson_filter,
            FormBuilderSurveyLink.survey_id == survey_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This survey is already associated here",
        )

    next_index = (
        db.execute(
            select(func.coalesce(func.max(FormBuilderSurveyLink.order_index), -1) + 1)
            .where(
                FormBuilderSurveyLink.course_master_id == master.id,
                lesson_filter,
            )
        ).scalar()
        or 0
    )

    link = FormBuilderSurveyLink(
        course_master_id=master.id,
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
    link = db.get(FormBuilderSurveyLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Association not found")
    db.delete(link)
    db.commit()


# ---------------------------------------------------------------------------
# Form links (lesson ↔ form, or course ↔ form when lesson_id is None)
# ---------------------------------------------------------------------------

def _serialize_form_link(link: FormBuilderFormLink) -> FormBuilderFormResponse:
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
    db: Session, master: CourseMaster, lesson_id: int | None
) -> list[FormBuilderFormResponse]:
    if lesson_id is not None:
        _validate_lesson_for_master(master, lesson_id)
        lesson_filter = FormBuilderFormLink.lesson_id == lesson_id
    else:
        lesson_filter = FormBuilderFormLink.lesson_id.is_(None)
    stmt = (
        select(FormBuilderFormLink)
        .where(
            FormBuilderFormLink.course_master_id == master.id,
            lesson_filter,
        )
        .order_by(FormBuilderFormLink.order_index, FormBuilderFormLink.id)
    )
    # Form eager-loads collection relationships (lazy="joined"), so the result
    # must be de-duplicated with unique() before materialising.
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_form_link(row) for row in rows]


def list_all_form_links(
    db: Session, master: CourseMaster
) -> list[FormBuilderFormResponse]:
    """All form links for this course master, across every lesson and the
    course itself (lesson_id IS NULL), ordered by lesson then position."""
    stmt = (
        select(FormBuilderFormLink)
        .where(FormBuilderFormLink.course_master_id == master.id)
        .order_by(
            FormBuilderFormLink.lesson_id.nulls_first(),
            FormBuilderFormLink.order_index,
            FormBuilderFormLink.id,
        )
    )
    # Form eager-loads collection relationships (lazy="joined"), so the result
    # must be de-duplicated with unique() before materialising.
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_form_link(row) for row in rows]


def associate_form(
    db: Session, master: CourseMaster, lesson_id: int | None, form_id: int
) -> FormBuilderFormResponse:
    if lesson_id is not None:
        _validate_lesson_for_master(master, lesson_id)

    form = db.get(Form, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if lesson_id is not None:
        lesson_filter = FormBuilderFormLink.lesson_id == lesson_id
    else:
        lesson_filter = FormBuilderFormLink.lesson_id.is_(None)

    # The DB unique constraint does not catch duplicate course-level links
    # (NULL lesson_id is distinct per row in Postgres), so guard explicitly.
    existing = db.execute(
        select(FormBuilderFormLink.id).where(
            FormBuilderFormLink.course_master_id == master.id,
            lesson_filter,
            FormBuilderFormLink.form_id == form_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This form is already associated here",
        )

    # Cross-category guard: a form already attached to this lesson via the
    # Evaluation category would surface twice on the lesson, so block it here.
    from app.modules.evaluation.models import EvaluationLessonForm

    ev_lesson_filter = (
        EvaluationLessonForm.lesson_id == lesson_id
        if lesson_id is not None
        else EvaluationLessonForm.lesson_id.is_(None)
    )
    cross = db.execute(
        select(EvaluationLessonForm.id).where(
            EvaluationLessonForm.course_master_id == master.id,
            ev_lesson_filter,
            EvaluationLessonForm.form_id == form_id,
        )
    ).first()
    if cross:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This form is already attached to this lesson via Evaluation.",
        )

    next_index = (
        db.execute(
            select(func.coalesce(func.max(FormBuilderFormLink.order_index), -1) + 1)
            .where(
                FormBuilderFormLink.course_master_id == master.id,
                lesson_filter,
            )
        ).scalar()
        or 0
    )

    link = FormBuilderFormLink(
        course_master_id=master.id,
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
    link = db.get(FormBuilderFormLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Association not found")
    db.delete(link)
    db.commit()


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def serialize_form_builder(master: CourseMaster) -> FormBuilderResponse:
    return FormBuilderResponse(
        id=master.id,
        course_master_id=master.id,
        title=master.title,
        status=form_builder_status_of(master),
        course_master_status=master.status,
        course_master_completion=master.surveys_completion,
    )
