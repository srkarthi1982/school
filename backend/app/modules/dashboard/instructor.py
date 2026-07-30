from datetime import timedelta
from .schemas import DashboardFilterState
from .policy import date_range_start, utc_now
from .query import apply_course_instance_scope
from app.modules.course.models import CourseInstance, course_instructors
from app.modules.quiz_bank.models import QuizAttempt
from app.modules.course_selection_schedule.lesson_content_models import CourseSelectionLessonRelease
from app.modules.evaluation.models import EvaluationLessonQuiz
from sqlalchemy import select, func, distinct
from sqlalchemy.orm import Session
from app.modules.class_session.models import ClassSession
from app.modules.it_support.models import Ticket
from app.modules.course_selection_material.models import (
    CourseSelectionMaterialFile,
    CourseSelectionMaterialUserProgress,
)
from app.modules.attendance.models import Attendance
from app.modules.profile.models import Profile
from app.modules.course_master.models import CourseMaster


def _date_range_start(params: DashboardFilterState | None):
    """Return the UTC datetime start of the selected date range, or None."""
    return date_range_start(params.dateRange) if params else None


def _apply_session_filters(stmt, params: DashboardFilterState | None):
    """Apply instructor + date-range filters to a ClassSession statement.

    The instructor filter value is a profiles.id; ClassSession.host_user_id is a
    users.id, so join through Profile.user_id. dateRange scopes scheduled_start.
    """
    if not params:
        return stmt
    if params.instructor != "all":
        stmt = stmt.join(Profile, Profile.user_id == ClassSession.host_user_id).where(
            Profile.id == int(params.instructor)
        )
    start = _date_range_start(params)
    if start:
        stmt = stmt.where(ClassSession.scheduled_start >= start)
    return stmt


def _apply_course_filters(stmt, params: DashboardFilterState | None):
    """Apply courseInstance / courseVersion / instructor filters to a statement
    built on CourseInstance."""
    return apply_course_instance_scope(stmt, params)


def _apply_quiz_filters(stmt, params: DashboardFilterState | None, eval_already_joined: bool = False):
    """Apply quiz-based filters to a statement joined on CourseSelectionLessonRelease.

    Covers courseInstance / instructor / lesson / evaluationType / student /
    dateRange (on QuizAttempt.submitted_at). ``stmt`` must already join
    CourseSelectionLessonRelease and QuizAttempt; student joins through
    Profile.user_id. Set ``eval_already_joined`` when the base statement already
    joins EvaluationLessonQuiz so we only constrain assessment_type (no re-join).
    """
    if not params:
        return stmt
    if params.courseInstance != "all":
        stmt = stmt.where(CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance))
    if params.instructor != "all":
        stmt = (
            stmt.join(CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id)
            .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )
    if params.lesson != "all":
        stmt = stmt.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
    if params.evaluationType != "all":
        if not eval_already_joined:
            stmt = stmt.join(
                EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id
            )
        stmt = stmt.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
    if params.student != "all":
        stmt = stmt.join(Profile, Profile.user_id == QuizAttempt.student_id).where(
            Profile.id == int(params.student)
        )
    start = _date_range_start(params)
    if start:
        stmt = stmt.where(QuizAttempt.submitted_at >= start)
    return stmt


def get_live_sessions_card(db: Session, user, params: DashboardFilterState = None) -> dict:
    """
    Return a card dict for the instructor dashboard showing the number of live or scheduled sessions.
    """
    now = utc_now()
    stmt = (
        select(func.count(ClassSession.id))
        .where(
            ClassSession.host_user_id == user.id,
            ClassSession.scheduled_start <= now,
            (ClassSession.actual_end.is_(None) | (ClassSession.actual_end > now))
        )
    )
    total = db.execute(stmt).scalar() or 0

    return {
        "helperText": "Currently scheduled",
        "label": "Live sessions",
        "statusLabel": "Live",
        "values": [],
        "value": f"{total:,}",
    }
def get_instructor_workload_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Returns the average planned teaching hours per instructor, applying optional
    instructor and date-range filters.
    """
    # Total scheduled seconds across all class sessions (in scope)
    total_seconds_stmt = select(
        func.sum(
            func.extract(
                "epoch",
                ClassSession.scheduled_end - ClassSession.scheduled_start,
            )
        )
    )
    total_seconds_stmt = _apply_session_filters(total_seconds_stmt, params)
    total_seconds = db.execute(total_seconds_stmt).scalar() or 0

    # Number of distinct instructors (in scope)
    instructor_cnt_stmt = select(func.count(distinct(ClassSession.host_user_id)))
    instructor_cnt_stmt = _apply_session_filters(instructor_cnt_stmt, params)
    instructor_cnt = db.execute(instructor_cnt_stmt).scalar() or 0

    avg_hours = round((total_seconds / 3600) / instructor_cnt, 1) if instructor_cnt else 0

    return {
        "helperText": "Average planned teaching hours per instructor",
        "label": "Average workload",
        "statusLabel": "Live",
        "values": [],
        "value": f"{avg_hours} hrs",
    }
    
def get_feedback_speed(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Returns average ticket response time (in minutes) for resolved tickets within
    the selected date range. Applies the instructor filter (assigned_to_id).
    """
    window_start = _date_range_start(params) or (utc_now() - timedelta(hours=24))

    stmt = (
        select(
            func.avg(
                func.extract("epoch", Ticket.updated_at - Ticket.created_at) / 60
            )
        )
        .where(
            Ticket.status == "resolved",
            Ticket.created_at >= window_start,
        )
    )
    if params and params.instructor != "all":
        stmt = stmt.where(Ticket.assigned_to_id == int(params.instructor))

    avg_minutes = db.execute(stmt).scalar() or 0
    avg_minutes_int = int(round(avg_minutes))

    helper_text = (
        f"{avg_minutes_int} min average created-to-resolved duration"
        if avg_minutes_int
        else "N/A: no resolved assigned support tickets"
    )

    return {
        "helperText": helper_text,
        "label": "Support ticket resolution duration",
        "statusLabel": "Live",
        "values": [],
        "value": f"{avg_minutes_int} min" if avg_minutes_int else "N/A",
    }

def get_active_instructors_strip(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Returns the number of active instructors (distinct hosts with scheduled sessions).
    """
    now = utc_now()
    stmt = (
        select(func.count(distinct(ClassSession.host_user_id)))
        .where(
            ClassSession.scheduled_start <= now,
            (ClassSession.actual_end.is_(None) | (ClassSession.actual_end > now)),
        )
    )
    active_instructors = db.execute(stmt).scalar() or 0

    return {
        "helperText": "",
        "label": "Active instructors",
        "statusLabel": "Live",
        "values": [],
        "value": f"{active_instructors}",
    }

def get_weak_students_by_lesson_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Returns the number of lessons that have weak students (students scoring below
    pass mark). Applies quiz-based filters.
    """
    stmt = (
        select(func.count(distinct(CourseSelectionLessonRelease.lesson_id)))
        .join(QuizAttempt, QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
        .join(EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            EvaluationLessonQuiz.pass_mark > 0,
            QuizAttempt.score < EvaluationLessonQuiz.pass_mark,
        )
    )
    # The base statement already joins EvaluationLessonQuiz, so tell the helper
    # not to re-join it when constraining assessment_type.
    stmt = _apply_quiz_filters(stmt, params, eval_already_joined=True)
    weak_lessons = db.execute(stmt).scalar() or 0

    return {
        "id": "instructor-004",
        "label": "Weak students by lesson",
        "value": f"{weak_lessons}",
        "helperText": "Students grouped by lesson-level weakness",
        "tone": "danger",
    }

def get_students_missing_material_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Returns the number of students who have not completed reviewing assigned
    material. A student is "missing" if a progress record exists with
    total_pages > 0 and pages_read < total_pages. Applies courseInstance / lesson
    / material / student filters (resolved through the material file and Profile).
    """
    stmt = (
        select(func.count(distinct(CourseSelectionMaterialUserProgress.user_id)))
        .join(
            CourseSelectionMaterialFile,
            CourseSelectionMaterialFile.id == CourseSelectionMaterialUserProgress.file_id,
        )
        .where(
            CourseSelectionMaterialUserProgress.total_pages > 0,
            CourseSelectionMaterialUserProgress.pages_read
            < CourseSelectionMaterialUserProgress.total_pages,
        )
    )

    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseSelectionMaterialFile.course_instance_id == int(params.courseInstance))
    if params and params.lesson != "all":
        stmt = stmt.where(CourseSelectionMaterialFile.lesson_id == int(params.lesson))
    if params and params.material != "all":
        # material filter value is a UUID string; column is UUID.
        stmt = stmt.where(CourseSelectionMaterialFile.id == params.material)
    if params and params.student != "all":
        # user_id is a users.id; student filter is a profiles.id.
        stmt = stmt.join(Profile, Profile.user_id == CourseSelectionMaterialUserProgress.user_id).where(
            Profile.id == int(params.student)
        )

    missing_count = db.execute(stmt).scalar() or 0

    return {
        "id": "instructor-005",
        "label": "Students who did not review material",
        "value": f"{missing_count}",
        "helperText": "Students missing assigned material review",
        "tone": "warning",
    }

def get_quiz_results_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Returns the average quiz score (as a percentage of max_score) across in-scope
    quiz attempts. Applies quiz-based filters.
    """
    stmt = (
        select(func.avg((QuizAttempt.score / QuizAttempt.max_score) * 100))
        .select_from(QuizAttempt)
        .join(
            CourseSelectionLessonRelease,
            QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id,
        )
        .where(
            QuizAttempt.score.is_not(None),
            QuizAttempt.max_score.is_not(None),
            QuizAttempt.max_score > 0,
            CourseSelectionLessonRelease.content_type == "quiz",
        )
    )
    stmt = _apply_quiz_filters(stmt, params)
    avg_score = db.execute(stmt).scalar() or 0
    try:
        avg_float = float(avg_score)
    except (TypeError, ValueError):
        avg_float = 0.0
    avg_percent = int(round(avg_float)) if avg_float else 0
    return {
        "id": "instructor-006",
        "label": "Quiz results",
        "value": f"{avg_percent}%",
        "helperText": "Latest quiz completion and performance summary",
        "tone": "success",
    }
def get_pending_evaluations_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Returns the number of quiz attempts pending manual evaluation — i.e. attempts
    that contain essay questions (``has_essay``) which require instructor grading.
    Applies quiz-based filters.
    """
    stmt = (
        select(func.count(QuizAttempt.id))
        .select_from(QuizAttempt)
        .join(
            CourseSelectionLessonRelease,
            QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id,
        )
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            QuizAttempt.has_essay.is_(True),
        )
    )
    stmt = _apply_quiz_filters(stmt, params)
    pending_count = db.execute(stmt).scalar() or 0

    return {
        "id": "instructor-003",
        "label": "Pending evaluations",
        "value": f"{pending_count}",
        "helperText": "Evaluations awaiting instructor action",
        "tone": "warning",
    }

def get_pending_attendance_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Returns the number of class sessions that are pending attendance submission.
    """
    # Assuming Attendance model has a status field where 'pending' indicates not yet submitted
    stmt = (
        select(func.count(Attendance.id))
        .where(Attendance.level == 2)
    )
    if params and params.instructor != "all":
        stmt = stmt.join(Profile, Profile.user_id == Attendance.user_id).where(
            Profile.id == int(params.instructor)
        )
    pending_count = db.execute(stmt).scalar() or 0

    return {
        "id": "instructor-002",
        "label": "Pending attendance",
        "value": f"{pending_count}",
        "helperText": "Sessions still waiting for attendance submission",
        "tone": "warning",
    }

def get_today_schedule_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Returns the number of class sessions scheduled for today. Applies the
    instructor filter (host_user_id via Profile) when set.
    """
    now = utc_now()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)

    stmt = (
        select(func.count(ClassSession.id))
        .where(
            ClassSession.scheduled_start >= start_of_day,
            ClassSession.scheduled_start < end_of_day,
        )
    )
    if params and params.instructor != "all":
        stmt = stmt.join(Profile, Profile.user_id == ClassSession.host_user_id).where(
            Profile.id == int(params.instructor)
        )
    today_count = db.execute(stmt).scalar() or 0

    return {
        "id": "instructor-001",
        "label": "Today's schedule",
        "value": f"{today_count}",
        "helperText": "Instructor sessions scheduled today",
        "tone": "info",
    }
    
def get_completion_strip(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Returns the overall completion percentage of class sessions in scope.
    Completion = completed sessions (actual_end set and in the past) over total
    scheduled sessions. Applies instructor + date-range filters.
    """
    now = utc_now()
    # Total number of class sessions (scheduled or completed) in scope
    total_stmt = select(func.count(ClassSession.id))
    total_stmt = _apply_session_filters(total_stmt, params)
    total = db.execute(total_stmt).scalar() or 0

    # Number of completed sessions in scope
    completed_stmt = (
        select(func.count(ClassSession.id))
        .where(
            ClassSession.actual_end.is_not(None),
            ClassSession.actual_end <= now,
        )
    )
    completed_stmt = _apply_session_filters(completed_stmt, params)
    completed = db.execute(completed_stmt).scalar() or 0

    completion_pct = int(round((completed / total) * 100)) if total else 0

    return {
        "helperText": "",
        "label": "Completion",
        "statusLabel": "Live",
        "values": [],
        "value": f"{completion_pct}%",
    }

def get_lessons_delivered_strip(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Returns the total number of lessons delivered (completed class sessions) in
    scope. Applies instructor + date-range filters.
    """
    now = utc_now()
    stmt = (
        select(func.count(ClassSession.id))
        .where(
            ClassSession.actual_end.is_not(None),
            ClassSession.actual_end <= now,
        )
    )
    stmt = _apply_session_filters(stmt, params)
    total_delivered = db.execute(stmt).scalar() or 0

    return {
        "helperText": "",
        "label": "Lessons delivered",
        "statusLabel": "Live",
        "values": [],
        "value": f"{total_delivered:,}",
    }
    
def get_upcoming_flight_bookings_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the number of upcoming flight/simulator bookings (status='SCHEDULED'
    with scheduled_start within the next 7 days). Applies the instructor filter
    (host_user_id via Profile). The date-range filter is backward-looking and
    does not apply to this forward-looking metric.
    """
    now = utc_now()
    window_end = now + timedelta(days=7)
    stmt = select(func.count(ClassSession.id)).where(
        ClassSession.status == "SCHEDULED",
        ClassSession.scheduled_start >= now,
        ClassSession.scheduled_start < window_end,
    )
    if params and params.instructor != "all":
        stmt = stmt.join(Profile, Profile.user_id == ClassSession.host_user_id).where(
            Profile.id == int(params.instructor)
        )
    count = db.execute(stmt).scalar() or 0
    return {
        "id": "instructor-007",
        "label": "Upcoming scheduled sessions",
        "value": f"{count}",
        "helperText": "Generic class sessions scheduled in the next 7 days",
        "tone": "info",
    }

def get_external_instructor_coordination_alerts_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Report the capability as unavailable. Support tickets are intentionally not
    treated as external-instructor coordination records.
    """
    return {
        "id": "instructor-008",
        "label": "External instructor coordination alerts",
        "value": "N/A",
        "helperText": "Unavailable: no external-instructor coordination data source",
        "tone": "info",
    }

def get_course_progress_status_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the overall course progress status as a percentage. Calculates the
    average of the six completion fields across in-scope CourseInstance rows.
    Applies courseInstance / courseVersion / instructor filters.
    """
    # Average of the six completion fields per row, then averaged across rows.
    completion_avg = (
        func.coalesce(CourseInstance.personnel_completion, 0)
        + func.coalesce(CourseInstance.course_info_completion, 0)
        + func.coalesce(CourseInstance.material_completion, 0)
        + func.coalesce(CourseInstance.surveys_completion, 0)
        + func.coalesce(CourseInstance.evaluation_completion, 0)
        + func.coalesce(CourseInstance.schedule_completion, 0)
    ) / 6.0
    stmt = select(func.avg(completion_avg)).select_from(CourseInstance)
    stmt = _apply_course_filters(stmt, params)
    avg_progress = db.execute(stmt).scalar() or 0
    progress_percent = int(round(avg_progress)) if avg_progress else 0
    return {
        "id": "instructor-010",
        "label": "Course progress status",
        "value": f"{progress_percent}%",
        "helperText": "Current course pacing against plan",
        "tone": "success",
    }
