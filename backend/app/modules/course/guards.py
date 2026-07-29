"""Stopped-course guards.

A course instance with status "stopped" is temporarily on hold: every write
activity tied to it (attendance, grading, schedule edits, enrollment changes,
edits) must be rejected until the course is resumed. Reads stay open — a
stopped course remains viewable.

These are plain helpers rather than FastAPI dependencies because most activity
endpoints resolve the course from a payload field or an existing DB row, not a
path parameter.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import CourseInstance

STOPPED_COURSE_STATUS = "stopped"


def ensure_course_not_stopped(db: Session, course_id: int | None) -> None:
    """Raise 409 when the course is stopped.

    ``None`` / unknown ids pass through — the endpoint's own 404 handling owns
    missing-course semantics.
    """
    if course_id is None:
        return
    course = db.get(CourseInstance, course_id)
    if course is not None and (course.status or "").lower() == STOPPED_COURSE_STATUS:
        raise HTTPException(
            status_code=409,
            detail=(
                f'Course "{course.title}" is stopped — activities are on hold '
                "until it is resumed."
            ),
        )


def _raise_if_any_stopped(db: Session, stmt) -> None:
    """Raise 409 when ``stmt`` (selecting stopped CourseInstance rows) matches."""
    course = db.execute(stmt.limit(1)).scalars().first()
    if course is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f'Course "{course.title}" is stopped — activities are on hold '
                "until it is resumed."
            ),
        )


def ensure_placement_not_stopped(db: Session, placement_id: int | None) -> None:
    """Guard via a session-schedule placement: placement → day → hub → course."""
    if placement_id is None:
        return
    from app.modules.course_session_schedule.models import (
        CourseSessionSchedule,
        CourseSessionScheduleDay,
        CourseSessionSchedulePlacement,
    )

    _raise_if_any_stopped(
        db,
        select(CourseInstance)
        .join(
            CourseSessionSchedule,
            CourseSessionSchedule.course_instance_id == CourseInstance.id,
        )
        .join(
            CourseSessionScheduleDay,
            CourseSessionScheduleDay.course_session_schedule_id
            == CourseSessionSchedule.id,
        )
        .join(
            CourseSessionSchedulePlacement,
            CourseSessionSchedulePlacement.course_session_schedule_day_id
            == CourseSessionScheduleDay.id,
        )
        .where(
            CourseSessionSchedulePlacement.id == placement_id,
            CourseInstance.status == STOPPED_COURSE_STATUS,
        ),
    )


def ensure_lesson_not_stopped(db: Session, lesson_id: int | None) -> None:
    """Guard via a course-selection lesson: lesson → lesson_creation → course."""
    if lesson_id is None:
        return
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreation,
        CourseSelectionInfoLessonCreationLesson,
    )

    _raise_if_any_stopped(
        db,
        select(CourseInstance)
        .join(
            CourseSelectionInfoLessonCreation,
            CourseSelectionInfoLessonCreation.course_instance_id == CourseInstance.id,
        )
        .join(
            CourseSelectionInfoLessonCreationLesson,
            CourseSelectionInfoLessonCreationLesson.course_selection_info_lesson_creation_id
            == CourseSelectionInfoLessonCreation.id,
        )
        .where(
            CourseSelectionInfoLessonCreationLesson.id == lesson_id,
            CourseInstance.status == STOPPED_COURSE_STATUS,
        ),
    )


# NOTE for the quiz/survey/form guards below: a quiz/survey/form linked to BOTH
# a stopped and an active course blocks for both. Refining by the student's
# enrollment is deliberately skipped — student_id semantics differ across the
# grading/attendance modules. Accepted over-block; revisit if it bites.

def ensure_quiz_not_stopped(db: Session, quiz_id: int | None) -> None:
    if quiz_id is None:
        return
    from app.modules.course_selection_evaluation.models import (
        CourseSelectionEvaluationLessonQuiz,
    )

    _raise_if_any_stopped(
        db,
        select(CourseInstance)
        .join(
            CourseSelectionEvaluationLessonQuiz,
            CourseSelectionEvaluationLessonQuiz.course_instance_id == CourseInstance.id,
        )
        .where(
            CourseSelectionEvaluationLessonQuiz.quiz_id == quiz_id,
            CourseInstance.status == STOPPED_COURSE_STATUS,
        ),
    )


def ensure_survey_not_stopped(db: Session, survey_id: int | None) -> None:
    if survey_id is None:
        return
    from app.modules.course_selection_form.models import CourseSelectionFormSurveyLink

    _raise_if_any_stopped(
        db,
        select(CourseInstance)
        .join(
            CourseSelectionFormSurveyLink,
            CourseSelectionFormSurveyLink.course_instance_id == CourseInstance.id,
        )
        .where(
            CourseSelectionFormSurveyLink.survey_id == survey_id,
            CourseInstance.status == STOPPED_COURSE_STATUS,
        ),
    )


def ensure_form_not_stopped(db: Session, form_id: int | None) -> None:
    """Forms attach to a course through BOTH the Form category links and the
    Evaluation lesson-form links — a stopped course on either blocks."""
    if form_id is None:
        return
    from app.modules.course_selection_evaluation.models import (
        CourseSelectionEvaluationLessonForm,
    )
    from app.modules.course_selection_form.models import CourseSelectionFormFormLink

    _raise_if_any_stopped(
        db,
        select(CourseInstance)
        .join(
            CourseSelectionFormFormLink,
            CourseSelectionFormFormLink.course_instance_id == CourseInstance.id,
        )
        .where(
            CourseSelectionFormFormLink.form_id == form_id,
            CourseInstance.status == STOPPED_COURSE_STATUS,
        ),
    )
    _raise_if_any_stopped(
        db,
        select(CourseInstance)
        .join(
            CourseSelectionEvaluationLessonForm,
            CourseSelectionEvaluationLessonForm.course_instance_id == CourseInstance.id,
        )
        .where(
            CourseSelectionEvaluationLessonForm.form_id == form_id,
            CourseInstance.status == STOPPED_COURSE_STATUS,
        ),
    )
