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
from app.modules.evaluation.models import EvaluationLessonForm, EvaluationLessonQuiz
from app.modules.course_selection_evaluation.models import (
    CourseSelectionEvaluationLessonForm,
    CourseSelectionEvaluationLessonQuiz,
)
from app.modules.course_selection_evaluation.schemas import (
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
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreationLesson,
    )

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Evaluation (per course instance)
#
# A course instance *is* its evaluation: ``course_instances.title`` is the title
# and the binary completion state lives in
# ``course_instances.evaluation_completion`` (100/0). The lesson↔quiz
# associations hang off ``course_instance_id``. The ``evaluation_id`` parameter
# name is preserved for symmetry with the master module, but its value is the
# course instance id.
# ---------------------------------------------------------------------------

def get_or_raise_course(db: Session, course_instance_id: int) -> CourseInstance:
    course = db.get(CourseInstance, course_instance_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found"
        )
    return course


def evaluation_status_of(course: CourseInstance) -> str:
    return "complete" if course.evaluation_completion >= 100 else "incomplete"


def set_evaluation_status(
    db: Session, course: CourseInstance, new_status: str, user_id: int
) -> CourseInstance:
    if new_status not in ("incomplete", "complete"):
        raise HTTPException(
            status_code=400, detail="status must be 'incomplete' or 'complete'"
        )
    if (
        new_status != "complete"
        and course.evaluation_completion >= 100
        and course.status == "approved"
    ):
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    course.evaluation_completion = 100 if new_status == "complete" else 0
    course.updated_by_id = user_id
    db.commit()
    db.refresh(course)
    return course


# ---------------------------------------------------------------------------
# Lazy seed from master
# ---------------------------------------------------------------------------

def seed_from_master(db: Session, course: CourseInstance) -> None:
    """Copy the master's lesson↔quiz and lesson↔form associations into this
    instance on first open.

    Idempotent via ``course.evaluation_seeded``. Quizzes and forms are global
    records, so only the association rows (quizzes carry their assessment config)
    are copied; each association's ``lesson_id`` is re-pointed at this instance's
    own cloned lesson. Thereafter the instance's associations are edited
    independently.
    """
    if course.evaluation_seeded:
        return

    # Course Information (incl. the lessons we attach to) must exist on the
    # instance before its master lesson associations can be re-pointed.
    csinfo.seed_course_info_from_master(db, course)
    lesson_map = csinfo.master_to_instance_lesson_ids(course)

    def _instance_lesson(master_lesson_id):
        return None if master_lesson_id is None else lesson_map.get(master_lesson_id)

    for assoc in (
        db.query(EvaluationLessonQuiz)
        .filter(EvaluationLessonQuiz.course_master_id == course.master_id)
        .all()
    ):
        db.add(
            CourseSelectionEvaluationLessonQuiz(
                course_instance_id=course.id,
                lesson_id=_instance_lesson(assoc.lesson_id),
                quiz_id=assoc.quiz_id,
                order_index=assoc.order_index,
                assessment_type=assoc.assessment_type,
                max_mark=assoc.max_mark,
                pass_mark=assoc.pass_mark,
                pass_percentage=assoc.pass_percentage,
                percentage_allocation=assoc.percentage_allocation,
            )
        )

    for link in (
        db.query(EvaluationLessonForm)
        .filter(EvaluationLessonForm.course_master_id == course.master_id)
        .all()
    ):
        db.add(
            CourseSelectionEvaluationLessonForm(
                course_instance_id=course.id,
                lesson_id=_instance_lesson(link.lesson_id),
                form_id=link.form_id,
                order_index=link.order_index,
            )
        )

    course.evaluation_seeded = True
    db.commit()


# ---------------------------------------------------------------------------
# Modification tracking (instance associations vs the master it was seeded from)
#
# Quizzes carry their assessment config, so the comparison includes it; forms are
# plain attachments. Compared as sets per lesson bucket (``None`` = course-scope);
# order is ignored.
# ---------------------------------------------------------------------------

def evaluation_modified_lessons(db: Session, course: CourseInstance) -> set[int | None]:
    """Lesson buckets whose quiz/form associations differ from the master."""
    if not course.evaluation_seeded:
        return set()

    def grouped_quizzes(model, owner_field: str, owner_id: int) -> dict[int | None, frozenset]:
        rows = db.execute(
            select(
                model.lesson_id,
                model.quiz_id,
                model.assessment_type,
                model.max_mark,
                model.pass_mark,
                model.pass_percentage,
                model.percentage_allocation,
            ).where(getattr(model, owner_field) == owner_id)
        ).all()
        acc: dict[int | None, set] = defaultdict(set)
        for lesson_id, *rest in rows:
            acc[lesson_id].add(tuple(rest))
        return {k: frozenset(v) for k, v in acc.items()}

    def grouped_forms(model, owner_field: str, owner_id: int) -> dict[int | None, frozenset]:
        rows = db.execute(
            select(model.lesson_id, model.form_id).where(
                getattr(model, owner_field) == owner_id
            )
        ).all()
        acc: dict[int | None, set] = defaultdict(set)
        for lesson_id, form_id in rows:
            acc[lesson_id].add(form_id)
        return {k: frozenset(v) for k, v in acc.items()}

    master_quiz = grouped_quizzes(EvaluationLessonQuiz, "course_master_id", course.master_id)
    master_form = grouped_forms(EvaluationLessonForm, "course_master_id", course.master_id)
    inst_quiz = grouped_quizzes(CourseSelectionEvaluationLessonQuiz, "course_instance_id", course.id)
    inst_form = grouped_forms(CourseSelectionEvaluationLessonForm, "course_instance_id", course.id)

    # Instance associations are keyed by this instance's own lesson ids; the
    # master's by master lesson ids. Compare each instance lesson bucket (plus the
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
            inst_quiz.get(key, frozenset()) != master_bucket(master_quiz, key)
            or inst_form.get(key, frozenset()) != master_bucket(master_form, key)
        ):
            modified.add(key)
    return modified


def evaluation_modified(db: Session, course: CourseInstance) -> bool:
    """True when any of this instance's evaluation associations differ from the master."""
    return bool(evaluation_modified_lessons(db, course))


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


def list_evaluation_lessons(
    db: Session, course: CourseInstance
) -> list[EvaluationLessonResponse]:
    lessons = _course_info_lessons(course)
    if not lessons:
        return []
    counts = dict(
        db.execute(
            select(
                CourseSelectionEvaluationLessonQuiz.lesson_id,
                func.count(CourseSelectionEvaluationLessonQuiz.id),
            )
            .where(
                CourseSelectionEvaluationLessonQuiz.course_instance_id == course.id,
                CourseSelectionEvaluationLessonQuiz.lesson_id.is_not(None),
            )
            .group_by(CourseSelectionEvaluationLessonQuiz.lesson_id)
        ).all()
    )
    form_counts = dict(
        db.execute(
            select(
                CourseSelectionEvaluationLessonForm.lesson_id,
                func.count(CourseSelectionEvaluationLessonForm.id),
            )
            .where(
                CourseSelectionEvaluationLessonForm.course_instance_id == course.id,
                CourseSelectionEvaluationLessonForm.lesson_id.is_not(None),
            )
            .group_by(CourseSelectionEvaluationLessonForm.lesson_id)
        ).all()
    )
    modified = evaluation_modified_lessons(db, course)
    return [
        EvaluationLessonResponse(
            id=lesson.id,
            lesson_number=lesson.lesson_number,
            lesson_title=lesson.lesson_title,
            order_index=lesson.order_index,
            quiz_count=int(counts.get(lesson.id, 0)),
            form_count=int(form_counts.get(lesson.id, 0)),
            modified=lesson.id in modified,
        )
        for lesson in lessons
    ]


# ---------------------------------------------------------------------------
# Lesson ↔ Quiz associations
# ---------------------------------------------------------------------------

def _serialize_association(
    assoc: CourseSelectionEvaluationLessonQuiz,
) -> EvaluationQuizResponse:
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
    db: Session, course: CourseInstance, lesson_id: int | None
) -> list[EvaluationQuizResponse]:
    if lesson_id is not None:
        _validate_lesson_for_course(course, lesson_id)
        lesson_filter = CourseSelectionEvaluationLessonQuiz.lesson_id == lesson_id
    else:
        lesson_filter = CourseSelectionEvaluationLessonQuiz.lesson_id.is_(None)
    stmt = (
        select(CourseSelectionEvaluationLessonQuiz)
        .where(
            CourseSelectionEvaluationLessonQuiz.course_instance_id == course.id,
            lesson_filter,
        )
        .order_by(
            CourseSelectionEvaluationLessonQuiz.order_index,
            CourseSelectionEvaluationLessonQuiz.id,
        )
    )
    rows = db.execute(stmt).scalars().all()
    return [_serialize_association(a) for a in rows]


def list_all_lesson_quizzes(
    db: Session, course: CourseInstance
) -> list[EvaluationQuizResponse]:
    """All quiz associations for this course instance, across every lesson and
    the course itself (lesson_id IS NULL), ordered by lesson then position."""
    stmt = (
        select(CourseSelectionEvaluationLessonQuiz)
        .where(CourseSelectionEvaluationLessonQuiz.course_instance_id == course.id)
        .order_by(
            CourseSelectionEvaluationLessonQuiz.lesson_id.nulls_first(),
            CourseSelectionEvaluationLessonQuiz.order_index,
            CourseSelectionEvaluationLessonQuiz.id,
        )
    )
    rows = db.execute(stmt).scalars().all()
    return [_serialize_association(a) for a in rows]


def associate_quiz(
    db: Session, course: CourseInstance, data: AssociateQuizRequest
) -> EvaluationQuizResponse:
    lesson_id = data.lesson_id
    if lesson_id is not None:
        _validate_lesson_for_course(course, lesson_id)

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
        lesson_filter = CourseSelectionEvaluationLessonQuiz.lesson_id == lesson_id
    else:
        lesson_filter = CourseSelectionEvaluationLessonQuiz.lesson_id.is_(None)

    existing = db.execute(
        select(CourseSelectionEvaluationLessonQuiz.id).where(
            CourseSelectionEvaluationLessonQuiz.course_instance_id == course.id,
            lesson_filter,
            CourseSelectionEvaluationLessonQuiz.quiz_id == data.quiz_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This quiz is already associated here",
        )

    current_total = int(
        db.execute(
            select(
                func.coalesce(
                    func.sum(CourseSelectionEvaluationLessonQuiz.percentage_allocation), 0
                )
            ).where(
                CourseSelectionEvaluationLessonQuiz.course_instance_id == course.id,
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
            select(
                func.coalesce(func.max(CourseSelectionEvaluationLessonQuiz.order_index), -1) + 1
            ).where(
                CourseSelectionEvaluationLessonQuiz.course_instance_id == course.id,
                lesson_filter,
            )
        ).scalar()
        or 0
    )

    assoc = CourseSelectionEvaluationLessonQuiz(
        course_instance_id=course.id,
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
    assoc = db.get(CourseSelectionEvaluationLessonQuiz, assoc_id)
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
        lesson_filter = CourseSelectionEvaluationLessonQuiz.lesson_id == assoc.lesson_id
    else:
        lesson_filter = CourseSelectionEvaluationLessonQuiz.lesson_id.is_(None)

    other_total = int(
        db.execute(
            select(
                func.coalesce(
                    func.sum(CourseSelectionEvaluationLessonQuiz.percentage_allocation), 0
                )
            ).where(
                CourseSelectionEvaluationLessonQuiz.course_instance_id == assoc.course_instance_id,
                lesson_filter,
                CourseSelectionEvaluationLessonQuiz.id != assoc.id,
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
    assoc = db.get(CourseSelectionEvaluationLessonQuiz, assoc_id)
    if not assoc:
        raise HTTPException(status_code=404, detail="Association not found")
    db.delete(assoc)
    db.commit()


# ---------------------------------------------------------------------------
# Lesson ↔ Form associations (a plain attachment — no assessment config)
# ---------------------------------------------------------------------------

def _serialize_form_link(
    link: CourseSelectionEvaluationLessonForm,
) -> EvaluationFormResponse:
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
    db: Session, course: CourseInstance, lesson_id: int | None
) -> list[EvaluationFormResponse]:
    if lesson_id is not None:
        _validate_lesson_for_course(course, lesson_id)
        lesson_filter = CourseSelectionEvaluationLessonForm.lesson_id == lesson_id
    else:
        lesson_filter = CourseSelectionEvaluationLessonForm.lesson_id.is_(None)
    stmt = (
        select(CourseSelectionEvaluationLessonForm)
        .where(
            CourseSelectionEvaluationLessonForm.course_instance_id == course.id,
            lesson_filter,
        )
        .order_by(
            CourseSelectionEvaluationLessonForm.order_index,
            CourseSelectionEvaluationLessonForm.id,
        )
    )
    # Form eager-loads collection relationships (lazy="joined"), so de-duplicate
    # with unique() before materialising.
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_form_link(row) for row in rows]


def list_all_lesson_forms(
    db: Session, course: CourseInstance
) -> list[EvaluationFormResponse]:
    """All form associations for this course instance, across every lesson and
    the course itself (lesson_id IS NULL), ordered by lesson then position."""
    stmt = (
        select(CourseSelectionEvaluationLessonForm)
        .where(CourseSelectionEvaluationLessonForm.course_instance_id == course.id)
        .order_by(
            CourseSelectionEvaluationLessonForm.lesson_id.nulls_first(),
            CourseSelectionEvaluationLessonForm.order_index,
            CourseSelectionEvaluationLessonForm.id,
        )
    )
    # Form eager-loads collection relationships (lazy="joined"), so de-duplicate
    # with unique() before materialising.
    rows = db.execute(stmt).unique().scalars().all()
    return [_serialize_form_link(row) for row in rows]


def associate_form(
    db: Session, course: CourseInstance, lesson_id: int | None, form_id: int
) -> EvaluationFormResponse:
    if lesson_id is not None:
        _validate_lesson_for_course(course, lesson_id)

    form = db.get(Form, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if lesson_id is not None:
        lesson_filter = CourseSelectionEvaluationLessonForm.lesson_id == lesson_id
    else:
        lesson_filter = CourseSelectionEvaluationLessonForm.lesson_id.is_(None)

    existing = db.execute(
        select(CourseSelectionEvaluationLessonForm.id).where(
            CourseSelectionEvaluationLessonForm.course_instance_id == course.id,
            lesson_filter,
            CourseSelectionEvaluationLessonForm.form_id == form_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This form is already associated here",
        )

    # Cross-category guard: a form already attached to this lesson via the Form
    # Builder category would surface twice on the lesson, so block it here.
    from app.modules.course_selection_form.models import CourseSelectionFormFormLink

    fb_lesson_filter = (
        CourseSelectionFormFormLink.lesson_id == lesson_id
        if lesson_id is not None
        else CourseSelectionFormFormLink.lesson_id.is_(None)
    )
    cross = db.execute(
        select(CourseSelectionFormFormLink.id).where(
            CourseSelectionFormFormLink.course_instance_id == course.id,
            fb_lesson_filter,
            CourseSelectionFormFormLink.form_id == form_id,
        )
    ).first()
    if cross:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This form is already attached to this lesson via Form Builder.",
        )

    next_index = (
        db.execute(
            select(
                func.coalesce(func.max(CourseSelectionEvaluationLessonForm.order_index), -1) + 1
            ).where(
                CourseSelectionEvaluationLessonForm.course_instance_id == course.id,
                lesson_filter,
            )
        ).scalar()
        or 0
    )

    link = CourseSelectionEvaluationLessonForm(
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
    link = db.get(CourseSelectionEvaluationLessonForm, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Association not found")
    db.delete(link)
    db.commit()


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def serialize_evaluation(
    course: CourseInstance, db: Session | None = None
) -> EvaluationResponse:
    modified = evaluation_modified_lessons(db, course) if db is not None else set()
    return EvaluationResponse(
        id=course.id,
        course_instance_id=course.id,
        title=course.title,
        status=evaluation_status_of(course),
        course_status=course.status,
        evaluation_completion=course.evaluation_completion,
        modified=bool(modified),
        course_modified=None in modified,
    )
