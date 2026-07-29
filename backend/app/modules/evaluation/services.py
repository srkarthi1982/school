from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.course_master.models import CourseMaster
from app.modules.evaluation.models import EvaluationLessonForm, EvaluationLessonQuiz
from app.modules.evaluation.schemas import (
    AssociateQuizRequest,
    EvaluationFormResponse,
    EvaluationLessonResponse,
    EvaluationQuizResponse,
    EvaluationResponse,
    UpdateQuizAssociationRequest,
)
from app.modules.form.models import Form
from app.modules.quiz_bank.models import Quiz

if TYPE_CHECKING:
    from app.modules.course_info.models import CourseInfoLessonCreationLesson

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Evaluation (per course master)
#
# The Evaluation category no longer has its own table. A course master *is* its
# evaluation: ``course_masters.title`` is the title, and the binary completion
# state lives directly in ``course_masters.evaluation_completion`` (100/0). The
# lesson↔quiz associations hang off ``course_master_id``. Throughout this module
# the ``evaluation_id`` parameter name is preserved for API stability, but its
# value is the course master id.
# ---------------------------------------------------------------------------

def get_or_raise_master(db: Session, course_master_id: int) -> CourseMaster:
    master = db.get(CourseMaster, course_master_id)
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found"
        )
    return master


def evaluation_status_of(master: CourseMaster) -> str:
    """Derive the binary evaluation status from the master's completion column."""
    return "complete" if master.evaluation_completion >= 100 else "incomplete"


def set_evaluation_status(
    db: Session, master: CourseMaster, new_status: str, user_id: int
) -> CourseMaster:
    if new_status not in ("incomplete", "complete"):
        raise HTTPException(
            status_code=400, detail="status must be 'incomplete' or 'complete'"
        )
    if (
        new_status != "complete"
        and master.evaluation_completion >= 100
        and master.status == "approved"
    ):
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    # Mirror the binary status into the course master's progress column.
    master.evaluation_completion = 100 if new_status == "complete" else 0
    master.updated_by_id = user_id
    db.commit()
    db.refresh(master)
    return master


# ---------------------------------------------------------------------------
# Lessons (sourced from Course Information → Lesson Creation)
# ---------------------------------------------------------------------------

def _course_info_lessons(master: CourseMaster) -> list[CourseInfoLessonCreationLesson]:
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


def list_evaluation_lessons(
    db: Session, master: CourseMaster
) -> list[EvaluationLessonResponse]:
    lessons = _course_info_lessons(master)
    if not lessons:
        return []
    counts = dict(
        db.execute(
            select(
                EvaluationLessonQuiz.lesson_id,
                func.count(EvaluationLessonQuiz.id),
            )
            .where(
                EvaluationLessonQuiz.course_master_id == master.id,
                EvaluationLessonQuiz.lesson_id.is_not(None),
            )
            .group_by(EvaluationLessonQuiz.lesson_id)
        ).all()
    )
    form_counts = dict(
        db.execute(
            select(
                EvaluationLessonForm.lesson_id,
                func.count(EvaluationLessonForm.id),
            )
            .where(
                EvaluationLessonForm.course_master_id == master.id,
                EvaluationLessonForm.lesson_id.is_not(None),
            )
            .group_by(EvaluationLessonForm.lesson_id)
        ).all()
    )
    return [
        EvaluationLessonResponse(
            id=lesson.id,
            lesson_number=lesson.lesson_number,
            lesson_title=lesson.lesson_title,
            order_index=lesson.order_index,
            quiz_count=int(counts.get(lesson.id, 0)),
            form_count=int(form_counts.get(lesson.id, 0)),
        )
        for lesson in lessons
    ]


# ---------------------------------------------------------------------------
# Lesson ↔ Quiz associations
# ---------------------------------------------------------------------------

def _serialize_association(assoc: EvaluationLessonQuiz) -> EvaluationQuizResponse:
    quiz = assoc.quiz
    return EvaluationQuizResponse(
        id=assoc.id,
        quiz_id=assoc.quiz_id,
        lesson_id=assoc.lesson_id,
        name=quiz.name if quiz else "",
        description=quiz.description if quiz else None,
        type=quiz.type if quiz else None,
        status=quiz.status if quiz else "",
        weight=quiz.weight if quiz else 0,
        question_count=len(quiz.questions) if quiz else 0,
        order_index=assoc.order_index,
        assessment_type=assoc.assessment_type,
        max_mark=assoc.max_mark,
        pass_mark=assoc.pass_mark,
        pass_percentage=assoc.pass_percentage,
        percentage_allocation=assoc.percentage_allocation,
        created_at=assoc.created_at,
    )


def list_lesson_quizzes(
    db: Session, master: CourseMaster, lesson_id: int | None
) -> list[EvaluationQuizResponse]:
    if lesson_id is not None:
        _validate_lesson_for_master(master, lesson_id)
        lesson_filter = EvaluationLessonQuiz.lesson_id == lesson_id
    else:
        lesson_filter = EvaluationLessonQuiz.lesson_id.is_(None)
    stmt = (
        select(EvaluationLessonQuiz)
        .where(
            EvaluationLessonQuiz.course_master_id == master.id,
            lesson_filter,
        )
        .order_by(EvaluationLessonQuiz.order_index, EvaluationLessonQuiz.id)
    )
    rows = db.execute(stmt).scalars().all()
    return [_serialize_association(a) for a in rows]


def list_all_lesson_quizzes(
    db: Session, master: CourseMaster
) -> list[EvaluationQuizResponse]:
    """All quiz associations for this course master, across every lesson and the
    course itself (lesson_id IS NULL), ordered by lesson then position."""
    stmt = (
        select(EvaluationLessonQuiz)
        .where(EvaluationLessonQuiz.course_master_id == master.id)
        .order_by(
            EvaluationLessonQuiz.lesson_id.nulls_first(),
            EvaluationLessonQuiz.order_index,
            EvaluationLessonQuiz.id,
        )
    )
    rows = db.execute(stmt).scalars().all()
    return [_serialize_association(a) for a in rows]


def associate_quiz(
    db: Session, master: CourseMaster, data: AssociateQuizRequest
) -> EvaluationQuizResponse:
    lesson_id = data.lesson_id
    if lesson_id is not None:
        _validate_lesson_for_master(master, lesson_id)

    if data.assessment_type not in (None, "theory", "practical"):
        raise HTTPException(
            status_code=400,
            detail="assessment_type must be 'theory' or 'practical'",
        )
    if data.pass_mark > data.max_mark:
        raise HTTPException(
            status_code=400, detail="Pass mark cannot exceed max mark"
        )

    quiz = db.get(Quiz, data.quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.status != "approved":
        raise HTTPException(
            status_code=400, detail="Only approved quizzes can be associated"
        )

    if lesson_id is not None:
        lesson_filter = EvaluationLessonQuiz.lesson_id == lesson_id
    else:
        lesson_filter = EvaluationLessonQuiz.lesson_id.is_(None)

    # The DB unique constraint does not catch duplicate course-level links
    # (NULL lesson_id is distinct per row in Postgres), so guard explicitly.
    existing = db.execute(
        select(EvaluationLessonQuiz.id).where(
            EvaluationLessonQuiz.course_master_id == master.id,
            lesson_filter,
            EvaluationLessonQuiz.quiz_id == data.quiz_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This quiz is already associated here",
        )

    # The combined percentage allocation of all quizzes in this lesson (or the
    # course) must not exceed 100.
    current_total = int(
        db.execute(
            select(func.coalesce(func.sum(EvaluationLessonQuiz.percentage_allocation), 0))
            .where(
                EvaluationLessonQuiz.course_master_id == master.id,
                lesson_filter,
            )
        ).scalar()
        or 0
    )
    if current_total + data.percentage_allocation > 100:
        raise HTTPException(
            status_code=400,
            detail=(
                "Total percentage allocation would exceed 100% "
                f"({current_total}% already allocated)"
            ),
        )

    next_index = (
        db.execute(
            select(func.coalesce(func.max(EvaluationLessonQuiz.order_index), -1) + 1)
            .where(
                EvaluationLessonQuiz.course_master_id == master.id,
                lesson_filter,
            )
        ).scalar()
        or 0
    )

    assoc = EvaluationLessonQuiz(
        course_master_id=master.id,
        lesson_id=lesson_id,
        quiz_id=data.quiz_id,
        order_index=int(next_index),
        assessment_type=data.assessment_type,
        max_mark=data.max_mark,
        pass_mark=data.pass_mark,
        pass_percentage=data.pass_percentage,
        percentage_allocation=data.percentage_allocation,
    )
    db.add(assoc)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This quiz is already associated here",
        )
    db.refresh(assoc)
    return _serialize_association(assoc)


def update_quiz_association(
    db: Session, assoc_id: int, data: UpdateQuizAssociationRequest
) -> EvaluationQuizResponse:
    assoc = db.get(EvaluationLessonQuiz, assoc_id)
    if not assoc:
        raise HTTPException(status_code=404, detail="Association not found")

    if data.assessment_type not in (None, "theory", "practical"):
        raise HTTPException(
            status_code=400,
            detail="assessment_type must be 'theory' or 'practical'",
        )
    if data.pass_mark > data.max_mark:
        raise HTTPException(
            status_code=400, detail="Pass mark cannot exceed max mark"
        )

    if assoc.lesson_id is not None:
        lesson_filter = EvaluationLessonQuiz.lesson_id == assoc.lesson_id
    else:
        lesson_filter = EvaluationLessonQuiz.lesson_id.is_(None)

    # Combined allocation of the *other* quizzes in this scope plus the new
    # value must not exceed 100.
    other_total = int(
        db.execute(
            select(func.coalesce(func.sum(EvaluationLessonQuiz.percentage_allocation), 0))
            .where(
                EvaluationLessonQuiz.course_master_id == assoc.course_master_id,
                lesson_filter,
                EvaluationLessonQuiz.id != assoc.id,
            )
        ).scalar()
        or 0
    )
    if other_total + data.percentage_allocation > 100:
        raise HTTPException(
            status_code=400,
            detail=(
                "Total percentage allocation would exceed 100% "
                f"({other_total}% allocated to other quizzes)"
            ),
        )

    assoc.assessment_type = data.assessment_type
    assoc.max_mark = data.max_mark
    assoc.pass_mark = data.pass_mark
    assoc.pass_percentage = data.pass_percentage
    assoc.percentage_allocation = data.percentage_allocation
    db.commit()
    db.refresh(assoc)
    return _serialize_association(assoc)


def dissociate_quiz(db: Session, assoc_id: int) -> None:
    assoc = db.get(EvaluationLessonQuiz, assoc_id)
    if not assoc:
        raise HTTPException(status_code=404, detail="Association not found")
    db.delete(assoc)
    db.commit()


# ---------------------------------------------------------------------------
# Lesson ↔ Form associations (a plain attachment — no assessment config)
# ---------------------------------------------------------------------------

def _serialize_form_link(link: EvaluationLessonForm) -> EvaluationFormResponse:
    form = link.form
    return EvaluationFormResponse(
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


def list_lesson_forms(
    db: Session, master: CourseMaster, lesson_id: int | None
) -> list[EvaluationFormResponse]:
    if lesson_id is not None:
        _validate_lesson_for_master(master, lesson_id)
        lesson_filter = EvaluationLessonForm.lesson_id == lesson_id
    else:
        lesson_filter = EvaluationLessonForm.lesson_id.is_(None)
    stmt = (
        select(EvaluationLessonForm)
        .where(
            EvaluationLessonForm.course_master_id == master.id,
            lesson_filter,
        )
        .order_by(EvaluationLessonForm.order_index, EvaluationLessonForm.id)
    )
    # Form eager-loads collection relationships (lazy="joined"), so the result
    # must be de-duplicated with unique() before materialising.
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_form_link(row) for row in rows]


def list_all_lesson_forms(
    db: Session, master: CourseMaster
) -> list[EvaluationFormResponse]:
    """All form associations for this course master, across every lesson and the
    course itself (lesson_id IS NULL), ordered by lesson then position."""
    stmt = (
        select(EvaluationLessonForm)
        .where(EvaluationLessonForm.course_master_id == master.id)
        .order_by(
            EvaluationLessonForm.lesson_id.nulls_first(),
            EvaluationLessonForm.order_index,
            EvaluationLessonForm.id,
        )
    )
    # Form eager-loads collection relationships (lazy="joined"), so the result
    # must be de-duplicated with unique() before materialising.
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_form_link(row) for row in rows]


def associate_form(
    db: Session, master: CourseMaster, lesson_id: int | None, form_id: int
) -> EvaluationFormResponse:
    if lesson_id is not None:
        _validate_lesson_for_master(master, lesson_id)

    form = db.get(Form, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if lesson_id is not None:
        lesson_filter = EvaluationLessonForm.lesson_id == lesson_id
    else:
        lesson_filter = EvaluationLessonForm.lesson_id.is_(None)

    # The DB unique constraint does not catch duplicate course-level links
    # (NULL lesson_id is distinct per row in Postgres), so guard explicitly.
    existing = db.execute(
        select(EvaluationLessonForm.id).where(
            EvaluationLessonForm.course_master_id == master.id,
            lesson_filter,
            EvaluationLessonForm.form_id == form_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This form is already associated here",
        )

    # Cross-category guard: a form already attached to this lesson via the Form
    # Builder category would surface twice on the lesson, so block it here.
    from app.modules.form_builder.models import FormBuilderFormLink

    fb_lesson_filter = (
        FormBuilderFormLink.lesson_id == lesson_id
        if lesson_id is not None
        else FormBuilderFormLink.lesson_id.is_(None)
    )
    cross = db.execute(
        select(FormBuilderFormLink.id).where(
            FormBuilderFormLink.course_master_id == master.id,
            fb_lesson_filter,
            FormBuilderFormLink.form_id == form_id,
        )
    ).first()
    if cross:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This form is already attached to this lesson via Form Builder.",
        )

    next_index = (
        db.execute(
            select(func.coalesce(func.max(EvaluationLessonForm.order_index), -1) + 1)
            .where(
                EvaluationLessonForm.course_master_id == master.id,
                lesson_filter,
            )
        ).scalar()
        or 0
    )

    link = EvaluationLessonForm(
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
    link = db.get(EvaluationLessonForm, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Association not found")
    db.delete(link)
    db.commit()


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def serialize_evaluation(master: CourseMaster) -> EvaluationResponse:
    return EvaluationResponse(
        id=master.id,
        course_master_id=master.id,
        title=master.title,
        status=evaluation_status_of(master),
        course_master_status=master.status,
        course_master_completion=master.evaluation_completion,
    )
