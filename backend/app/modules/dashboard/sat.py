from sqlalchemy import func, select, distinct
from .schemas import DashboardFilterState
from datetime import datetime, timedelta
from app.modules.it_support.models import Ticket
from sqlalchemy.orm import Session
from app.modules.course.models import CourseEnrollment, course_instructors
from app.modules.course.models import CourseInstance, CourseModificationRequest, CourseEnrollment
from app.modules.class_session.models import ClassSession
from app.modules.course_selection_material.models import CourseSelectionMaterialFile
from app.modules.course_selection_info.models import (
    CourseSelectionInfoLessonCreation,
    CourseSelectionInfoLessonCreationLesson,
)
from app.modules.course_master.models import CourseMaster
from app.modules.course_selection_schedule.lesson_content_models import CourseSelectionLessonRelease
from app.modules.quiz_bank.models import QuizAttempt
from app.modules.evaluation.models import EvaluationLessonQuiz
from app.modules.profile.models import Profile

# Ticket statuses (see app.modules.it_support.models.TicketStatus). There is no
# "pending" status; open review work is "submitted" or "viewed".
_OPEN_TICKET_STATUSES = ("submitted", "viewed")
# CourseModificationRequestStatus.WAIT_FOR_APPROVAL.value == "WAIT_APPROVAL".
_MOD_REQUEST_WAITING = "WAIT_APPROVAL"


def _date_range_start(params: DashboardFilterState | None):
    """Return the UTC datetime start of the selected date range, or None."""
    if not params or params.dateRange == "all":
        return None
    now = datetime.utcnow()
    if params.dateRange == "24h":
        return now - timedelta(hours=24)
    if params.dateRange == "7d":
        return now - timedelta(days=7)
    if params.dateRange == "30d":
        return now - timedelta(days=30)
    return None


def _bucket_spec(params: DashboardFilterState | None):
    """Return (bucket_count, bucket_td, bucket_label) for the date range.

    Hourly for 24h, daily for 7d/30d — mirrors the leadership card trends.
    """
    if params and params.dateRange == "7d":
        return 7, timedelta(days=1), "day"
    if params and params.dateRange == "30d":
        return 30, timedelta(days=1), "day"
    return 24, timedelta(hours=1), "hour"


def _floor_to_bucket(dt: datetime, bucket_label: str) -> datetime:
    if bucket_label == "hour":
        return dt.replace(minute=0, second=0, microsecond=0)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _zero_fill_buckets(trend_rows, bucket_count, bucket_td, bucket_label, now):
    """Map date_trunc buckets to counts and zero-fill every bucket in the window."""
    counts: dict[datetime, int] = {}
    for b, c in trend_rows:
        if b is None:
            continue
        key = b.replace(tzinfo=None) if b.tzinfo is not None else b
        counts[_floor_to_bucket(key, bucket_label)] = int(c)
    values: list[int] = []
    for i in range(bucket_count):
        start = now - timedelta(seconds=bucket_td.total_seconds() * (bucket_count - 1 - i))
        values.append(counts.get(_floor_to_bucket(start, bucket_label), 0))
    return values


def _apply_course_filters(stmt, params: DashboardFilterState | None):
    """Apply courseInstance / courseVersion / instructor filters to a statement
    built on CourseInstance. Returns the (possibly re-joined) statement."""
    if not params:
        return stmt
    if params.courseInstance != "all":
        stmt = stmt.where(CourseInstance.id == int(params.courseInstance))
    if params.courseVersion != "all":
        stmt = stmt.join(CourseMaster, CourseInstance.master_id == CourseMaster.id).where(
            CourseMaster.ctp_version == params.courseVersion
        )
    if params.instructor != "all":
        stmt = stmt.join(
            course_instructors, course_instructors.c.course_instance_id == CourseInstance.id
        ).where(course_instructors.c.instructor_id == int(params.instructor))
    return stmt


def get_sat_courses_by_version_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the number of distinct course versions (master records) currently in use.
    Applies courseInstance / courseVersion / instructor filters.
    """
    stmt = select(func.count(func.distinct(CourseInstance.master_id))).select_from(CourseInstance)

    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseInstance.id == int(params.courseInstance))

    if params and params.courseVersion != "all":
        stmt = stmt.join(CourseMaster, CourseInstance.master_id == CourseMaster.id).where(
            CourseMaster.ctp_version == params.courseVersion
        )

    if params and params.instructor != "all":
        stmt = stmt.join(
            course_instructors, course_instructors.c.course_instance_id == CourseInstance.id
        ).where(course_instructors.c.instructor_id == int(params.instructor))

    count = db.execute(stmt).scalar() or 0
    return {
        "id": "sat-001",
        "label": "Courses by version",
        "value": f"{count}",
        "helperText": "Published course versions currently in use",
        "tone": "info",
    }
    
def get_sat_materials_needing_update_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of material files that need SAT content refresh.
    Applies courseInstance / lesson / material filters.
    """
    stmt = select(func.count(func.distinct(CourseSelectionMaterialFile.id))).select_from(
        CourseSelectionMaterialFile
    )

    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseSelectionMaterialFile.course_instance_id == int(params.courseInstance))

    if params and params.lesson != "all":
        stmt = stmt.where(CourseSelectionMaterialFile.lesson_id == int(params.lesson))

    if params and params.material != "all":
        # material filter value is a UUID string; the column is UUID.
        stmt = stmt.where(CourseSelectionMaterialFile.id == params.material)

    count = db.execute(stmt).scalar() or 0
    return {
        "id": "sat-003",
        "label": "Materials needing update",
        "value": f"{count}",
        "helperText": "Materials flagged for SAT content refresh",
        "tone": "warning",
    }
    
def get_sat_repeated_weak_quiz_lessons_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of lessons that are flagged as weak in multiple cohorts.
    Mirrors the logic from leadership.get_repeated_weak_lessons_section.
    Applies quiz-based filters (courseInstance / instructor / lesson /
    evaluationType / student / dateRange).
    """
    weak_subq = (
        select(
            CourseSelectionLessonRelease.lesson_id,
            func.count(distinct(CourseSelectionLessonRelease.course_instance_id)).label("cohort_cnt"),
        )
        .join(QuizAttempt, QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
        .join(EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            EvaluationLessonQuiz.pass_mark > 0,
            QuizAttempt.score < EvaluationLessonQuiz.pass_mark,
        )
    )

    if params and params.courseInstance != "all":
        weak_subq = weak_subq.where(
            CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
        )
    if params and params.instructor != "all":
        weak_subq = (
            weak_subq.join(
                CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id
            )
            .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )
    if params and params.lesson != "all":
        weak_subq = weak_subq.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
    if params and params.evaluationType != "all":
        weak_subq = weak_subq.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
    if params and params.student != "all":
        # QuizAttempt.student_id is a users.id; student filter is a profiles.id.
        weak_subq = (
            weak_subq.join(Profile, Profile.user_id == QuizAttempt.student_id)
            .where(Profile.id == int(params.student))
        )
    start = _date_range_start(params)
    if start:
        weak_subq = weak_subq.where(QuizAttempt.submitted_at >= start)

    weak_subq = weak_subq.group_by(CourseSelectionLessonRelease.lesson_id).subquery()
    stmt = select(func.count()).where(weak_subq.c.cohort_cnt > 1)
    count = db.execute(stmt).scalar() or 0
    return {
        "id": "sat-004",
        "label": "Repeated weak quiz lessons",
        "value": f"{count}",
        "helperText": "Repeated weak quiz lessons",
        "tone": "danger",
    }

def get_sat_evaluation_item_weakness_trends_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of evaluation items (quizzes) that are flagged as weak in
    multiple cohorts. Mirrors repeated weak lessons but groups by evaluation
    quiz instead of lesson. Applies quiz-based filters.
    """
    weak_subq = (
        select(
            EvaluationLessonQuiz.quiz_id,
            func.count(distinct(CourseSelectionLessonRelease.course_instance_id)).label("cohort_cnt"),
        )
        .join(QuizAttempt, QuizAttempt.quiz_id == EvaluationLessonQuiz.quiz_id)
        .join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.content_id == QuizAttempt.quiz_id,
        )
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            EvaluationLessonQuiz.pass_mark > 0,
            QuizAttempt.score < EvaluationLessonQuiz.pass_mark,
        )
    )

    if params and params.courseInstance != "all":
        weak_subq = weak_subq.where(
            CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
        )
    if params and params.instructor != "all":
        weak_subq = (
            weak_subq.join(
                CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id
            )
            .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )
    if params and params.lesson != "all":
        weak_subq = weak_subq.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
    if params and params.evaluationType != "all":
        weak_subq = weak_subq.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
    if params and params.student != "all":
        weak_subq = (
            weak_subq.join(Profile, Profile.user_id == QuizAttempt.student_id)
            .where(Profile.id == int(params.student))
        )
    start = _date_range_start(params)
    if start:
        weak_subq = weak_subq.where(QuizAttempt.submitted_at >= start)

    weak_subq = weak_subq.group_by(EvaluationLessonQuiz.quiz_id).subquery()
    stmt = select(func.count()).where(weak_subq.c.cohort_cnt > 1)
    count = db.execute(stmt).scalar() or 0
    return {
        "id": "sat-005",
        "label": "Evaluation item weakness trends",
        "value": f"{count}",
        "helperText": "Recurring weak items across evaluation forms",
        "tone": "warning",
    }

def get_sat_lesson_duration_issues_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of lessons whose duration (flight_timing) falls outside the
    approved range (30‑180 minutes). Applies courseInstance / instructor filters
    via the lesson's course instance (lesson → lesson creation → course instance).
    """
    stmt = (
        select(func.count())
        .select_from(CourseSelectionInfoLessonCreationLesson)
        .join(
            CourseSelectionInfoLessonCreation,
            CourseSelectionInfoLessonCreationLesson.course_selection_info_lesson_creation_id
            == CourseSelectionInfoLessonCreation.id,
        )
        .where(
            (CourseSelectionInfoLessonCreationLesson.flight_timing < 30)
            | (CourseSelectionInfoLessonCreationLesson.flight_timing > 180)
        )
    )

    if params and params.courseInstance != "all":
        stmt = stmt.where(
            CourseSelectionInfoLessonCreation.course_instance_id == int(params.courseInstance)
        )
    if params and params.instructor != "all":
        stmt = (
            stmt.join(
                CourseInstance,
                CourseSelectionInfoLessonCreation.course_instance_id == CourseInstance.id,
            )
            .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )

    count = db.execute(stmt).scalar() or 0
    return {
        "id": "sat-002",
        "label": "Lesson duration issues",
        "value": f"{count}",
        "helperText": "Lessons outside approved duration bands",
        "tone": "warning",
    }

def get_sat_feedback_trends_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the percentage change in average ticket response time (resolved tickets)
    between the most recent 12‑hour window and the preceding 12‑hour window.
    Applies the instructor filter (mapped to assigned_to_id).
    """
    now = datetime.utcnow()
    window = timedelta(hours=12)
    recent_start = now - window
    prev_start = recent_start - window

    def _avg_stmt(start, end):
        s = (
            select(
                func.avg(
                    func.extract("epoch", Ticket.updated_at - Ticket.created_at) / 60
                )
            )
            .where(
                Ticket.status == "resolved",
                Ticket.created_at >= start,
                Ticket.created_at < end,
            )
        )
        if params and params.instructor != "all":
            s = s.where(Ticket.assigned_to_id == int(params.instructor))
        return s

    recent_avg = db.execute(_avg_stmt(recent_start, now)).scalar() or 0
    prev_avg = db.execute(_avg_stmt(prev_start, recent_start)).scalar() or 0

    # Compute percentage change (improvement if recent_avg is lower)
    if prev_avg == 0:
        pct_change = 0.0
    else:
        pct_change = ((prev_avg - recent_avg) / prev_avg) * 100

    sign = "+" if pct_change >= 0 else "-"
    value = f"{sign}{abs(pct_change):.1f}%"

    tone = "success" if pct_change >= 0 else "warning"

    return {
        "id": "sat-007",
        "label": "Feedback trends",
        "value": value,
        "helperText": "Avg ticket response time change vs previous 12h",
        "tone": tone,
    }

def get_sat_course_structure_gaps_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of course structure gaps (lessons missing a lesson_number).
    Applies courseInstance / instructor filters via the lesson's course instance.
    """
    stmt = (
        select(func.count())
        .select_from(CourseSelectionInfoLessonCreationLesson)
        .join(
            CourseSelectionInfoLessonCreation,
            CourseSelectionInfoLessonCreationLesson.course_selection_info_lesson_creation_id
            == CourseSelectionInfoLessonCreation.id,
        )
        .where(
            (CourseSelectionInfoLessonCreationLesson.lesson_number == None)
            | (CourseSelectionInfoLessonCreationLesson.lesson_number == "")
        )
    )

    if params and params.courseInstance != "all":
        stmt = stmt.where(
            CourseSelectionInfoLessonCreation.course_instance_id == int(params.courseInstance)
        )
    if params and params.instructor != "all":
        stmt = (
            stmt.join(
                CourseInstance,
                CourseSelectionInfoLessonCreation.course_instance_id == CourseInstance.id,
            )
            .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )

    count = db.execute(stmt).scalar() or 0
    return {
        "id": "sat-006",
        "label": "Course structure gaps",
        "value": f"{count}",
        "helperText": "Missing prerequisites, sequence breaks, and lesson gaps",
        "tone": "warning",
    }

def get_sat_active_candidates_card(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the number of distinct enrolled students (active SAT candidates),
    applying optional filters. ``values`` is the count of new enrollments per
    time bucket over the selected date range (by enrollment_date).
    """
    # --- Total distinct enrolled students in scope (after filters) ---
    stmt = (
        select(func.count(distinct(CourseEnrollment.student_id)))
        .select_from(CourseEnrollment)
        .join(CourseInstance, CourseEnrollment.course_instance_id == CourseInstance.id)
    )
    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseInstance.id == int(params.courseInstance))
    if params and params.courseVersion != "all":
        stmt = stmt.join(CourseMaster, CourseInstance.master_id == CourseMaster.id).where(
            CourseMaster.ctp_version == params.courseVersion
        )
    if params and params.instructor != "all":
        stmt = stmt.join(
            course_instructors, course_instructors.c.course_instance_id == CourseInstance.id
        ).where(course_instructors.c.instructor_id == int(params.instructor))
    if params and params.lesson != "all":
        stmt = stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
    if params and params.material != "all":
        stmt = stmt.join(
            CourseSelectionMaterialFile,
            CourseSelectionMaterialFile.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionMaterialFile.id == params.material)
    if params and params.evaluationType != "all":
        stmt = stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).join(
            EvaluationLessonQuiz,
            EvaluationLessonQuiz.quiz_id == CourseSelectionLessonRelease.content_id,
        ).where(EvaluationLessonQuiz.assessment_type == params.evaluationType)

    count = db.execute(stmt).scalar() or 0

    # --- New-enrollment trend over the selected date range ---
    bucket_count, bucket_td, bucket_label = _bucket_spec(params)
    now = datetime.utcnow()
    window_start = now - timedelta(seconds=bucket_td.total_seconds() * bucket_count)

    trend_stmt = (
        select(
            func.date_trunc(bucket_label, CourseEnrollment.enrollment_date).label("b"),
            func.count(distinct(CourseEnrollment.student_id)),
        )
        .select_from(CourseEnrollment)
        .join(CourseInstance, CourseEnrollment.course_instance_id == CourseInstance.id)
        .where(
            CourseEnrollment.enrollment_date.is_not(None),
            CourseEnrollment.enrollment_date >= window_start,
        )
    )
    if params and params.courseInstance != "all":
        trend_stmt = trend_stmt.where(CourseInstance.id == int(params.courseInstance))
    if params and params.instructor != "all":
        trend_stmt = trend_stmt.join(
            course_instructors, course_instructors.c.course_instance_id == CourseInstance.id
        ).where(course_instructors.c.instructor_id == int(params.instructor))
    trend_stmt = trend_stmt.group_by("b").order_by("b")
    trend_rows = db.execute(trend_stmt).all()

    values = _zero_fill_buckets(trend_rows, bucket_count, bucket_td, bucket_label, now)

    unit = "hour" if bucket_label == "hour" else "day"
    helper_text = ""
    if len(values) >= 2:
        latest, prev = values[-1], values[-2]
        if prev:
            delta = latest - prev
            sign = "+" if delta >= 0 else ""
            helper_text = f"{sign}{delta} vs previous {unit}"
        else:
            helper_text = f"{latest} new this {unit}"

    return {
        "label": "Active SAT candidates",
        "helperText": helper_text,
        "statusLabel": "Live",
        "values": values,
        "value": f"{count}",
    }

def get_sat_usage_volume_card(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return usage volume based on the total number of ClassSession records,
    scoped to the selected date range. ``values`` is the session count per time
    bucket. Applies the instructor filter (host_user_id) and date range.
    """
    bucket_count, bucket_td, bucket_label = _bucket_spec(params)
    now = datetime.utcnow()
    window_start = now - timedelta(seconds=bucket_td.total_seconds() * bucket_count)

    # --- Total session count in scope (within the window) ---
    stmt = select(func.count(ClassSession.id)).where(ClassSession.scheduled_start >= window_start)
    if params and params.instructor != "all":
        stmt = stmt.join(Profile, Profile.user_id == ClassSession.host_user_id).where(
            Profile.id == int(params.instructor)
        )
    count = db.execute(stmt).scalar() or 0

    # --- Session count per bucket ---
    bucket_col = func.date_trunc(bucket_label, ClassSession.scheduled_start).label("b")
    trend_stmt = (
        select(bucket_col, func.count(ClassSession.id))
        .select_from(ClassSession)
        .where(ClassSession.scheduled_start >= window_start)
    )
    if params and params.instructor != "all":
        trend_stmt = trend_stmt.join(Profile, Profile.user_id == ClassSession.host_user_id).where(
            Profile.id == int(params.instructor)
        )
    trend_stmt = trend_stmt.group_by(bucket_col).order_by(bucket_col)
    trend_rows = db.execute(trend_stmt).all()

    values = _zero_fill_buckets(trend_rows, bucket_count, bucket_td, bucket_label, now)

    def _format_number(num: int) -> str:
        if num >= 1_000_000:
            return f"{num // 1_000_000}M"
        if num >= 1_000:
            return f"{num // 1_000}k"
        return str(num)

    unit = "hour" if bucket_label == "hour" else "day"
    return {
        "label": "Usage volume",
        "helperText": f"Last {bucket_count} {unit}s",
        "statusLabel": "Live",
        "values": values,
        "value": _format_number(count),
    }

def get_sat_courses_requiring_revision_item(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of courses that have pending modification requests awaiting
    approval. Applies courseInstance / instructor filters via the request's course.
    """
    stmt = (
        select(func.count(distinct(CourseModificationRequest.id)))
        .select_from(CourseModificationRequest)
        .where(CourseModificationRequest.status == _MOD_REQUEST_WAITING)
    )

    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseModificationRequest.course_id == int(params.courseInstance))
    if params and params.instructor != "all":
        stmt = (
            stmt.join(CourseInstance, CourseModificationRequest.course_id == CourseInstance.id)
            .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )

    count = db.execute(stmt).scalar() or 0
    return {
        "id": "sat-008",
        "label": "Courses requiring revision",
        "value": f"{count}",
        "helperText": "Courses ready for SAT quality review",
        "tone": "warning" if count > 0 else "info",
    }
    
def get_sat_practice_completion_trend_card(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the practice completion trend: the average of the six CourseInstance
    completion fields per time bucket (by start_date) over the selected date
    range. ``value`` is the overall average across the in-scope instances.
    """
    # Average of the six completion fields, expressed per row then averaged.
    completion_expr = (
        func.coalesce(CourseInstance.personnel_completion, 0)
        + func.coalesce(CourseInstance.course_info_completion, 0)
        + func.coalesce(CourseInstance.material_completion, 0)
        + func.coalesce(CourseInstance.surveys_completion, 0)
        + func.coalesce(CourseInstance.evaluation_completion, 0)
        + func.coalesce(CourseInstance.schedule_completion, 0)
    ) / 6.0

    # --- Overall average across in-scope instances ---
    overall_stmt = select(func.avg(completion_expr)).select_from(CourseInstance)
    overall_stmt = _apply_course_filters(overall_stmt, params)
    overall = db.execute(overall_stmt).scalar() or 0
    value = f"{int(round(overall))}%"

    # --- Per-bucket trend by start_date ---
    bucket_count, bucket_td, bucket_label = _bucket_spec(params)
    now = datetime.utcnow()
    window_start = now - timedelta(seconds=bucket_td.total_seconds() * bucket_count)
    # start_date is a DATE; compare against the window start date.
    window_start_date = window_start.date()

    bucket_col = func.date_trunc(bucket_label, CourseInstance.start_date).label("b")
    trend_stmt = (
        select(bucket_col, func.avg(completion_expr))
        .select_from(CourseInstance)
        .where(CourseInstance.start_date.is_not(None), CourseInstance.start_date >= window_start_date)
    )
    trend_stmt = _apply_course_filters(trend_stmt, params)
    trend_stmt = trend_stmt.group_by(bucket_col).order_by(bucket_col)
    trend_rows = db.execute(trend_stmt).all()

    # date_trunc on a DATE returns timestamps at midnight; zero-fill by date.
    values: list[int] = []
    counts: dict[datetime, float] = {}
    for b, avg_v in trend_rows:
        if b is None:
            continue
        key = b.replace(tzinfo=None) if b.tzinfo is not None else b
        counts[_floor_to_bucket(key, bucket_label)] = float(avg_v or 0)
    for i in range(bucket_count):
        start = now - timedelta(seconds=bucket_td.total_seconds() * (bucket_count - 1 - i))
        values.append(int(round(counts.get(_floor_to_bucket(start, bucket_label), 0))))

    helper_text = ""
    if len(values) >= 2:
        latest, prev = values[-1], values[-2]
        if prev:
            delta = latest - prev
            sign = "+" if delta >= 0 else ""
            helper_text = f"{sign}{delta}% vs previous {'hour' if bucket_label == 'hour' else 'day'}"
        else:
            helper_text = f"{latest}% this {'hour' if bucket_label == 'hour' else 'day'}"

    return {
        "helperText": helper_text,
        "label": "Practice completion",
        "statusLabel": "Live",
        "values": values,
        "value": value,
    }
    
def get_sat_practice_completion_card(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the average practice completion percentage across in-scope
    CourseInstance records. Averages the six completion fields. Applies
    courseInstance / courseVersion / instructor filters.
    """
    stmt = select(
        func.avg(CourseInstance.personnel_completion).label("personnel"),
        func.avg(CourseInstance.course_info_completion).label("info"),
        func.avg(CourseInstance.material_completion).label("material"),
        func.avg(CourseInstance.surveys_completion).label("surveys"),
        func.avg(CourseInstance.evaluation_completion).label("evaluation"),
        func.avg(CourseInstance.schedule_completion).label("schedule"),
    ).select_from(CourseInstance)
    stmt = _apply_course_filters(stmt, params)
    result = db.execute(stmt).first()
    if result:
        total = sum([r or 0 for r in result])
        avg = total / 6
        value = f"{int(round(avg))}%"
    else:
        value = "0%"

    return {
        "label": "Practice completion",
        "helperText": "",
        "statusLabel": "Live",
        "values": [],
        "value": value,
    }

def get_sat_pass_rate_strip(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the overall pass rate percentage across in-scope quiz attempts.
    Pass is defined as QuizAttempt.score >= EvaluationLessonQuiz.pass_mark
    (only considering quizzes with a positive pass_mark). Applies quiz-based
    filters (courseInstance / instructor / lesson / evaluationType / student /
    dateRange).
    """
    # Total quiz attempts (only quiz content)
    total_stmt = (
        select(func.count(func.distinct(QuizAttempt.id)))
        .join(CourseSelectionLessonRelease, QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
        .join(EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            EvaluationLessonQuiz.pass_mark > 0,
        )
    )

    # Passed attempts
    passed_stmt = (
        select(func.count(func.distinct(QuizAttempt.id)))
        .join(CourseSelectionLessonRelease, QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
        .join(EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            EvaluationLessonQuiz.pass_mark > 0,
            QuizAttempt.score >= EvaluationLessonQuiz.pass_mark,
        )
    )

    def _apply(s):
        if params and params.courseInstance != "all":
            s = s.where(CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance))
        if params and params.instructor != "all":
            s = (
                s.join(CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id)
                .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
                .where(course_instructors.c.instructor_id == int(params.instructor))
            )
        if params and params.lesson != "all":
            s = s.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
        if params and params.evaluationType != "all":
            s = s.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
        if params and params.student != "all":
            s = s.join(Profile, Profile.user_id == QuizAttempt.student_id).where(
                Profile.id == int(params.student)
            )
        start = _date_range_start(params)
        if start:
            s = s.where(QuizAttempt.submitted_at >= start)
        return s

    total = db.execute(_apply(total_stmt)).scalar() or 0
    passed = db.execute(_apply(passed_stmt)).scalar() or 0

    rate = int(round((passed / total) * 100)) if total else 0
    return {
        "label": "Pass rate",
        "helperText": "",
        "statusLabel": "Live",
        "values": [],
        "value": f"{rate}%",
    }

def get_sat_pending_reviews_strip(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the total number of open review tickets. There is no "pending" ticket
    status; open review work is "submitted" or "viewed". Applies the instructor
    filter (assigned_to_id) and date range (on created_at).
    """
    stmt = select(func.count(Ticket.id)).where(Ticket.status.in_(_OPEN_TICKET_STATUSES))

    if params and params.instructor != "all":
        stmt = stmt.where(Ticket.assigned_to_id == int(params.instructor))

    start = _date_range_start(params)
    if start:
        stmt = stmt.where(Ticket.created_at >= start)

    count = db.execute(stmt).scalar() or 0
    return {
        "label": "Pending reviews",
        "helperText": "",
        "statusLabel": "Live",
        "values": [],
        "value": f"{count}",
    }

def get_sat_average_score_strip(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the average quiz score across in-scope quiz attempts.
    Mirrors leadership.get_average_score but scoped for the SAT view. Applies
    quiz-based filters (courseInstance / instructor / lesson / evaluationType /
    student / dateRange).
    """
    stmt = (
        select(
            func.avg(
                (QuizAttempt.score / QuizAttempt.max_score) * 100
            )
        )
        .select_from(QuizAttempt)
        .join(
            CourseSelectionLessonRelease,
            QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id,
        )
        .where(
            QuizAttempt.score != None,
            QuizAttempt.max_score != None,
            QuizAttempt.max_score > 0,
            CourseSelectionLessonRelease.content_type == "quiz",
        )
    )

    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance))
    if params and params.instructor != "all":
        stmt = (
            stmt.join(CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id)
            .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )
    if params and params.lesson != "all":
        stmt = stmt.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
    if params and params.evaluationType != "all":
        stmt = stmt.join(EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id).where(
            EvaluationLessonQuiz.assessment_type == params.evaluationType
        )
    if params and params.student != "all":
        stmt = stmt.join(Profile, Profile.user_id == QuizAttempt.student_id).where(
            Profile.id == int(params.student)
        )
    start = _date_range_start(params)
    if start:
        stmt = stmt.where(QuizAttempt.submitted_at >= start)

    avg_score = db.execute(stmt).scalar_one()
    avg_score = round(avg_score or 0, 1)
    return {
        "label": "Average score",
        "helperText": "",
        "statusLabel": "Live",
        "values": [],
        "value": f"{int(avg_score)}%",
    }
