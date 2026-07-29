from sqlalchemy.orm import Session
from sqlalchemy import select, func, distinct
from app.modules.course.models import CourseInstance, course_instructors
from app.modules.course.models import CourseEnrollment
from app.modules.course_selection_material.models import CourseSelectionMaterialFile, CourseSelectionMaterialUserProgress
from app.modules.evaluation.models import EvaluationLessonQuiz
from app.modules.course_selection_schedule.lesson_content_models import CourseSelectionLessonRelease, CourseSelectionLessonCompletion
from app.modules.class_session.models import ClassSession
from app.modules.quiz_bank.models import QuizAttempt
from app.modules.attendance.models import Attendance
from app.modules.attendance_status.models import AttendanceStatus
from app.modules.it_support.models import Ticket
from app.modules.profile.models import Profile
from app.modules.analytics.models import UsageEvent
from .kpis import get_api_export_kpis
from .schemas import DashboardFilterState

def get_active_learners(db: Session, params: DashboardFilterState) -> dict:
    """
    Return the count of distinct active learners, applying optional filters.
    Filters that are not applicable to this metric are ignored.

    ``value`` is the total number of distinct enrolled learners in scope. The
    ``values`` trend is the distinct count of those learners who were active
    (made a tracked request) per day over the selected date range — sourced
    from ``usage_events`` joined back to the enrollment set, mirroring the
    analytics module's distinct-active-user approach.
    """
    from datetime import datetime, timedelta

    # --- Total enrolled learners in scope (after filters) ---
    stmt = select(func.count(distinct(CourseEnrollment.student_id))).select_from(CourseEnrollment)

    # Join CourseInstance for filters that relate to the course instance
    stmt = stmt.join(CourseInstance, CourseEnrollment.course_instance_id == CourseInstance.id)

    # Filter by specific course instance
    if params.courseInstance != "all":
        stmt = stmt.where(CourseInstance.id == int(params.courseInstance))

    # Filter by instructor
    if params.instructor != "all":
        stmt = stmt.join(
            course_instructors,
            course_instructors.c.course_instance_id == CourseInstance.id,
        )
        stmt = stmt.where(course_instructors.c.instructor_id == int(params.instructor))

    # Filter by lesson
    if params.lesson != "all":
        stmt = stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        )
        stmt = stmt.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))

    # Filter by material
    if params.material != "all":
        stmt = stmt.join(
            CourseSelectionMaterialFile,
            CourseSelectionMaterialFile.course_instance_id == CourseInstance.id,
        )
        stmt = stmt.where(CourseSelectionMaterialFile.id == params.material)

    # Filter by evaluation type
    if params.evaluationType != "all":
        # Join through lesson release to evaluation quiz
        stmt = stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).join(
            EvaluationLessonQuiz,
            EvaluationLessonQuiz.quiz_id == CourseSelectionLessonRelease.content_id,
        )
        stmt = stmt.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)

    total = db.execute(stmt).scalar() or 0

    # --- Active-learner trend over the selected date range ---
    # The learner set is the same enrollment filter above (distinct student
    # profile ids). ``CourseEnrollment.student_id`` is a profiles.id, while
    # ``UsageEvent.user_id`` is a users.id, so join through Profile.user_id.
    # Granularity follows the window: hourly for 24h (matches the original
    # "vs previous hour" framing), daily for 7d/30d.
    now = datetime.utcnow()
    if params.dateRange == "24h":
        bucket_count, bucket_td = 24, timedelta(hours=1)
        bucket_label = "hour"
    elif params.dateRange == "7d":
        bucket_count, bucket_td = 7, timedelta(days=1)
        bucket_label = "day"
    elif params.dateRange == "30d":
        bucket_count, bucket_td = 30, timedelta(days=1)
        bucket_label = "day"
    else:
        bucket_count, bucket_td = 24, timedelta(hours=1)
        bucket_label = "hour"
    window_start = now - timedelta(seconds=bucket_td.total_seconds() * bucket_count)

    enrolled_subq = (
        select(CourseEnrollment.student_id)
        .join(CourseInstance, CourseEnrollment.course_instance_id == CourseInstance.id)
    )
    if params.courseInstance != "all":
        enrolled_subq = enrolled_subq.where(CourseInstance.id == int(params.courseInstance))
    if params.instructor != "all":
        enrolled_subq = enrolled_subq.join(
            course_instructors,
            course_instructors.c.course_instance_id == CourseInstance.id,
        ).where(course_instructors.c.instructor_id == int(params.instructor))
    if params.lesson != "all":
        enrolled_subq = enrolled_subq.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
    if params.material != "all":
        enrolled_subq = enrolled_subq.join(
            CourseSelectionMaterialFile,
            CourseSelectionMaterialFile.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionMaterialFile.id == params.material)
    if params.evaluationType != "all":
        enrolled_subq = enrolled_subq.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).join(
            EvaluationLessonQuiz,
            EvaluationLessonQuiz.quiz_id == CourseSelectionLessonRelease.content_id,
        ).where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
    enrolled_subq = enrolled_subq.distinct().subquery()

    # Bucket timestamp down to the granularity. ``date_trunc`` keeps the
    # timezone-aware column comparable across hourly/daily windows.
    bucket_col = func.date_trunc(bucket_label, UsageEvent.timestamp).label("b")
    trend_stmt = (
        select(bucket_col, func.count(distinct(UsageEvent.user_id)))
        .select_from(UsageEvent)
        .join(Profile, Profile.user_id == UsageEvent.user_id)
        .join(enrolled_subq, enrolled_subq.c.student_id == Profile.id)
        .where(UsageEvent.timestamp >= window_start, UsageEvent.user_id.is_not(None))
        .group_by(bucket_col)
        .order_by(bucket_col)
    )
    trend_rows = db.execute(trend_stmt).all()

    # Index buckets by a comparable key (UTC datetime floored to the bucket).
    # ``date_trunc`` returns tz-aware datetimes; normalise both sides to a
    # naive UTC datetime so the zero-fill lookup matches regardless of how the
    # driver formats the column.
    def _floor_to_bucket(dt: datetime) -> datetime:
        if bucket_label == "hour":
            return dt.replace(minute=0, second=0, microsecond=0)
        return dt.replace(hour=0, minute=0, second=0, microsecond=0)

    counts_by_bucket: dict[datetime, int] = {}
    for b, c in trend_rows:
        if b is None:
            continue
        key = b.replace(tzinfo=None) if b.tzinfo is not None else b
        counts_by_bucket[_floor_to_bucket(key)] = int(c)

    # Zero-fill every bucket in the window so the sparkline shows gaps where no
    # learner was active (matching the "Last N {hours|days}" framing).
    values: list[int] = []
    for i in range(bucket_count):
        bucket_start = now - timedelta(seconds=bucket_td.total_seconds() * (bucket_count - 1 - i))
        values.append(counts_by_bucket.get(_floor_to_bucket(bucket_start), 0))

    # Compare the latest available bucket against the previous one for the
    # helper text; fall back to a neutral message when there's no trend yet.
    helper_text = ""
    if len(values) >= 2:
        latest, prev = values[-1], values[-2]
        unit = "hour" if bucket_label == "hour" else "day"
        if prev:
            delta = latest - prev
            sign = "+" if delta >= 0 else ""
            helper_text = f"{sign}{delta} vs previous {unit}"
        else:
            helper_text = f"{latest} active this {unit}"

    return {
        "helperText": helper_text,
        "label": "Active learners",
        "statusLabel": "Live",
        "values": values,
        "value": f"{total:,}",
    }

def get_usage_volume(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of class sessions (usage volume), applying optional filters.
    Only filters that correspond to actual ClassSession fields are applied.

    ``value`` is the total session count in scope. ``values`` is the session
    count per time bucket over the selected date range, bucketed hourly for
    24h and daily for 7d/30d.
    """
    from datetime import datetime, timedelta

    now = datetime.utcnow()
    if params and params.dateRange == "7d":
        bucket_count, bucket_td, bucket_label = 7, timedelta(days=1), "day"
    elif params and params.dateRange == "30d":
        bucket_count, bucket_td, bucket_label = 30, timedelta(days=1), "day"
    else:  # "24h" and default ("all")
        bucket_count, bucket_td, bucket_label = 24, timedelta(hours=1), "hour"
    window_start = now - timedelta(seconds=bucket_td.total_seconds() * bucket_count)

    # --- Total session count in scope (after filters) ---
    stmt = select(func.count(ClassSession.id))

    # Filter by instructor (host_user_id)
    if params and params.instructor != "all":
        stmt = stmt.where(ClassSession.host_user_id == int(params.instructor))

    # Scope the total to the same window as the trend.
    stmt = stmt.where(ClassSession.scheduled_start >= window_start)
    total = db.execute(stmt).scalar() or 0

    # --- Session count per bucket over the window ---
    bucket_col = func.date_trunc(bucket_label, ClassSession.scheduled_start).label("b")
    trend_stmt = (
        select(bucket_col, func.count(ClassSession.id))
        .select_from(ClassSession)
        .where(ClassSession.scheduled_start >= window_start)
    )
    if params and params.instructor != "all":
        trend_stmt = trend_stmt.where(ClassSession.host_user_id == int(params.instructor))
    trend_stmt = (
        trend_stmt.group_by(bucket_col)
        .order_by(bucket_col)
    )
    trend_rows = db.execute(trend_stmt).all()

    def _floor_to_bucket(dt: datetime) -> datetime:
        if bucket_label == "hour":
            return dt.replace(minute=0, second=0, microsecond=0)
        return dt.replace(hour=0, minute=0, second=0, microsecond=0)

    counts_by_bucket: dict[datetime, int] = {}
    for b, c in trend_rows:
        if b is None:
            continue
        key = b.replace(tzinfo=None) if b.tzinfo is not None else b
        counts_by_bucket[_floor_to_bucket(key)] = int(c)

    values: list[int] = []
    for i in range(bucket_count):
        bucket_start = now - timedelta(seconds=bucket_td.total_seconds() * (bucket_count - 1 - i))
        values.append(counts_by_bucket.get(_floor_to_bucket(bucket_start), 0))

    def _format_number(num: int) -> str:
        if num >= 1_000_000:
            return f"{num/1_000_000:.1f}M"
        if num >= 1_000:
            return f"{num/1_000:.0f}k"
        return str(num)

    unit = "hour" if bucket_label == "hour" else "day"
    helper_text = f"Last {bucket_count} {unit}s"

    return {
        "helperText": helper_text,
        "label": "Usage volume",
        "statusLabel": "Live",
        "values": values,
        "value": _format_number(total),
    }

def get_course_health(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return average health metrics for courses, applying optional filters.
    Filters that are not applicable are ignored.
    """
    stmt = select(
        func.avg(CourseInstance.personnel_completion),
        func.avg(CourseInstance.course_info_completion),
        func.avg(CourseInstance.material_completion),
        func.avg(CourseInstance.surveys_completion),
        func.avg(CourseInstance.evaluation_completion),
        func.avg(CourseInstance.schedule_completion),
    ).select_from(CourseInstance)

    # Filter by specific course instance
    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseInstance.id == int(params.courseInstance))

    # Filter by instructor via course_instructors relationship
    if params and params.instructor != "all":
        stmt = stmt.join(
            course_instructors,
            course_instructors.c.course_instance_id == CourseInstance.id,
        ).where(course_instructors.c.instructor_id == int(params.instructor))

    # Filter by lesson
    if params and params.lesson != "all":
        stmt = stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))

    # Filter by material
    if params and params.material != "all":
        stmt = stmt.join(
            CourseSelectionMaterialFile,
            CourseSelectionMaterialFile.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionMaterialFile.id == params.material)

    # Filter by evaluation type
    if params and params.evaluationType != "all":
        stmt = stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).join(
            EvaluationLessonQuiz,
            EvaluationLessonQuiz.quiz_id == CourseSelectionLessonRelease.content_id,
        ).where(EvaluationLessonQuiz.assessment_type == params.evaluationType)

    result = db.execute(stmt).first()
    if result:
        avg_vals = [v or 0 for v in result]
        overall = int(round(sum(avg_vals) / len(avg_vals)))
    else:
        overall = 0
    health_str = f"{overall}%"
    return {
        "helperText": "",
        "label": "Course health",
        "statusLabel": "Live",
        "values": [],
        "value": health_str,
    }

def get_support_response(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return average ticket resolution time (in ms) for resolved tickets,
    applying optional filters. Only filters that map to Ticket fields are used.

    ``value`` is the average resolution time across the whole window. ``values``
    is the average resolution time per time bucket (hourly for 24h, daily for
    7d/30d) so the trend shows how response time varies over the window.
    """
    from datetime import datetime, timedelta

    now = datetime.utcnow()

    # Determine the start of the time window based on the selected date range.
    # Default to the previous 24 hours if no dateRange filter is provided.
    if params and params.dateRange == "7d":
        bucket_count, bucket_td, bucket_label = 7, timedelta(days=1), "day"
    elif params and params.dateRange == "30d":
        bucket_count, bucket_td, bucket_label = 30, timedelta(days=1), "day"
    else:  # "24h" and default ("all")
        bucket_count, bucket_td, bucket_label = 24, timedelta(hours=1), "hour"
    window_start = now - timedelta(seconds=bucket_td.total_seconds() * bucket_count)

    # Resolution time in ms, reused for the overall average and the per-bucket trend.
    resolution_ms = func.extract("epoch", Ticket.updated_at - Ticket.created_at) * 1000

    # --- Overall average resolution time across the window ---
    stmt = (
        select(func.avg(resolution_ms))
        .where(
            Ticket.status == "resolved",
            Ticket.created_at >= window_start,
        )
    )
    # Optional filter by assigned support staff (instructor filter maps to assigned_to_id)
    if params and params.instructor != "all":
        stmt = stmt.where(Ticket.assigned_to_id == int(params.instructor))

    avg_ms = db.execute(stmt).scalar() or 0
    avg_ms_int = int(round(avg_ms))

    # --- Average resolution time per bucket over the window ---
    bucket_col = func.date_trunc(bucket_label, Ticket.created_at).label("b")
    trend_stmt = (
        select(bucket_col, func.avg(resolution_ms))
        .where(
            Ticket.status == "resolved",
            Ticket.created_at >= window_start,
        )
    )
    if params and params.instructor != "all":
        trend_stmt = trend_stmt.where(Ticket.assigned_to_id == int(params.instructor))
    trend_stmt = (
        trend_stmt.group_by(bucket_col)
        .order_by(bucket_col)
    )
    trend_rows = db.execute(trend_stmt).all()

    def _floor_to_bucket(dt: datetime) -> datetime:
        if bucket_label == "hour":
            return dt.replace(minute=0, second=0, microsecond=0)
        return dt.replace(hour=0, minute=0, second=0, microsecond=0)

    ms_by_bucket: dict[datetime, int] = {}
    for b, m in trend_rows:
        if b is None:
            continue
        key = b.replace(tzinfo=None) if b.tzinfo is not None else b
        ms_by_bucket[_floor_to_bucket(key)] = int(round(m or 0))

    values: list[int] = []
    for i in range(bucket_count):
        bucket_start = now - timedelta(seconds=bucket_td.total_seconds() * (bucket_count - 1 - i))
        values.append(ms_by_bucket.get(_floor_to_bucket(bucket_start), 0))

    helper_text = f"-{avg_ms_int} ms vs target" if avg_ms_int else ""

    return {
        "helperText": helper_text,
        "label": "Support response",
        "statusLabel": "Live",
        "values": values,
        "value": f"{avg_ms_int} ms",
    }

def get_completion_rate(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the percentage of courses completed, applying optional filters.
    Filters that do not map to CourseInstance fields are ignored.
    """
    from datetime import datetime, timedelta

    # Base statements for total and completed counts
    total_stmt = select(func.count(CourseInstance.id))
    completed_stmt = select(func.count(CourseInstance.id)).where(
        CourseInstance.status.in_(["COMPLETED", "CLOSED", "completed", "closed"])
    )

    # Apply filters to both statements
    if params and params.courseInstance != "all":
        total_stmt = total_stmt.where(CourseInstance.id == int(params.courseInstance))
        completed_stmt = completed_stmt.where(CourseInstance.id == int(params.courseInstance))

    if params and params.instructor != "all":
        total_stmt = total_stmt.join(
            course_instructors,
            course_instructors.c.course_instance_id == CourseInstance.id,
        ).where(course_instructors.c.instructor_id == int(params.instructor))
        completed_stmt = completed_stmt.join(
            course_instructors,
            course_instructors.c.course_instance_id == CourseInstance.id,
        ).where(course_instructors.c.instructor_id == int(params.instructor))

    if params and params.lesson != "all":
        total_stmt = total_stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
        completed_stmt = completed_stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))

    if params and params.material != "all":
        total_stmt = total_stmt.join(
            CourseSelectionMaterialFile,
            CourseSelectionMaterialFile.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionMaterialFile.id == params.material)
        completed_stmt = completed_stmt.join(
            CourseSelectionMaterialFile,
            CourseSelectionMaterialFile.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionMaterialFile.id == params.material)

    if params and params.evaluationType != "all":
        total_stmt = total_stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).join(
            EvaluationLessonQuiz,
            EvaluationLessonQuiz.quiz_id == CourseSelectionLessonRelease.content_id,
        ).where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
        completed_stmt = completed_stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).join(
            EvaluationLessonQuiz,
            EvaluationLessonQuiz.quiz_id == CourseSelectionLessonRelease.content_id,
        ).where(EvaluationLessonQuiz.assessment_type == params.evaluationType)

    # Date range filter based on CourseInstance.start_date (date)
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            # Convert datetime to date for comparison with start_date column
            start_date = start.date()
            total_stmt = total_stmt.where(CourseInstance.start_date >= start_date)
            completed_stmt = completed_stmt.where(CourseInstance.start_date >= start_date)

    total = db.execute(total_stmt).scalar() or 0
    completed = db.execute(completed_stmt).scalar() or 0
    rate = int(round((completed / total) * 100)) if total else 0

    return {
        "helperText": "",
        "label": "Completion",
        "statusLabel": "Live",
        "values": [],
        "value": f"{rate}%",
    }

def get_attendance_rate(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the attendance rate (percentage of present records), applying optional filters.
    Filters that do not map to Attendance fields are ignored.

    ``courseInstance``/``instructor`` are resolved through the lesson's course
    instance (``CourseSelectionLessonRelease`` carries ``lesson_id`` ↔
    ``course_instance_id``). ``Attendance.student_id`` is a users.id, so the
    student filter (a profiles.id) joins through ``Profile.user_id``.
    """
    from datetime import datetime, timedelta

    # Base statements for total and present counts
    total_stmt = select(func.count(Attendance.id))
    present_stmt = (
        select(func.count(Attendance.id))
        .join(AttendanceStatus, Attendance.status_id == AttendanceStatus.id)
        .where(AttendanceStatus.code == "present")
    )

    # Optional filter by lesson (Attendance.lesson_id)
    if params and params.lesson != "all":
        total_stmt = total_stmt.where(Attendance.lesson_id == int(params.lesson))
        present_stmt = present_stmt.where(Attendance.lesson_id == int(params.lesson))

    # Filter by specific course instance / instructor via the lesson's course
    # instance. Use a DISTINCT (lesson_id, course_instance_id) subquery so
    # joining does not multiply attendance rows.
    if params and (params.courseInstance != "all" or params.instructor != "all"):
        rel_subq = (
            select(
                CourseSelectionLessonRelease.lesson_id,
                CourseSelectionLessonRelease.course_instance_id,
            )
            .distinct()
        )
        if params.instructor != "all":
            rel_subq = rel_subq.join(
                CourseInstance,
                CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
            ).join(
                course_instructors,
                course_instructors.c.course_instance_id == CourseInstance.id,
            ).where(course_instructors.c.instructor_id == int(params.instructor))
        rel_subq = rel_subq.subquery()

        total_stmt = total_stmt.join(
            rel_subq, rel_subq.c.lesson_id == Attendance.lesson_id
        )
        present_stmt = present_stmt.join(
            rel_subq, rel_subq.c.lesson_id == Attendance.lesson_id
        )
        if params.courseInstance != "all":
            total_stmt = total_stmt.where(
                rel_subq.c.course_instance_id == int(params.courseInstance)
            )
            present_stmt = present_stmt.where(
                rel_subq.c.course_instance_id == int(params.courseInstance)
            )

    # Filter by student. Attendance.student_id is a users.id; the student
    # filter value is a profiles.id, so join through Profile (user_id is unique).
    if params and params.student != "all":
        total_stmt = (
            total_stmt.join(Profile, Profile.user_id == Attendance.student_id)
            .where(Profile.id == int(params.student))
        )
        present_stmt = (
            present_stmt.join(Profile, Profile.user_id == Attendance.student_id)
            .where(Profile.id == int(params.student))
        )

    # Optional date range filter on Attendance.date (date field)
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            # Convert to date for comparison with Attendance.date column
            start_date = start.date()
            total_stmt = total_stmt.where(Attendance.date >= start_date)
            present_stmt = present_stmt.where(Attendance.date >= start_date)

    total = db.execute(total_stmt).scalar() or 0
    present = db.execute(present_stmt).scalar() or 0
    rate = int(round((present / total) * 100)) if total else 0
    return {
        "helperText": "",
        "label": "Attendance",
        "statusLabel": "Live",
        "values": [],
        "value": f"{rate}%",
    }

def get_average_score(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the average quiz score (percentage) applying optional filters.
    Filters that do not map to the underlying tables are ignored.
    """
    from datetime import datetime, timedelta

    # Base statement
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

    # Filter by specific course instance
    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance))

    # Filter by instructor (via course_instructors relationship)
    if params and params.instructor != "all":
        stmt = (
            stmt.join(
                CourseInstance,
                CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
            )
            .join(
                course_instructors,
                course_instructors.c.course_instance_id == CourseInstance.id,
            )
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )

    # Filter by lesson
    if params and params.lesson != "all":
        stmt = stmt.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))

    # Filter by evaluation type
    if params and params.evaluationType != "all":
        stmt = (
            stmt.join(
                EvaluationLessonQuiz,
                EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id,
            )
            .where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
        )

    # Date range filter on QuizAttempt.created_at (if present)
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            stmt = stmt.where(QuizAttempt.created_at >= start)

    avg_score = db.execute(stmt).scalar_one()
    avg_score = round(avg_score or 0, 1)
    return {
        "helperText": "",
        "label": "Average score",
        "statusLabel": "Live",
        "values": [],
        "value": f"{int(avg_score)}%",
    }

def get_active_courses_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of active courses (status not draft/closed), applying optional filters.
    Filters that do not map to CourseInstance fields are ignored.
    """
    from datetime import datetime, timedelta

    stmt = select(func.count(distinct(CourseInstance.id))).where(
        CourseInstance.status.notin_(["draft", "closed"])
    )

    # Filter by specific course instance
    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseInstance.id == int(params.courseInstance))

    # Filter by instructor via course_instructors relationship
    if params and params.instructor != "all":
        stmt = stmt.join(
            course_instructors,
            course_instructors.c.course_instance_id == CourseInstance.id,
        ).where(course_instructors.c.instructor_id == int(params.instructor))

    # Filter by lesson
    if params and params.lesson != "all":
        stmt = stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))

    # Filter by material
    if params and params.material != "all":
        stmt = stmt.join(
            CourseSelectionMaterialFile,
            CourseSelectionMaterialFile.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionMaterialFile.id == params.material)

    # Filter by evaluation type
    if params and params.evaluationType != "all":
        stmt = stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).join(
            EvaluationLessonQuiz,
            EvaluationLessonQuiz.quiz_id == CourseSelectionLessonRelease.content_id,
        ).where(EvaluationLessonQuiz.assessment_type == params.evaluationType)

    # Date range filter based on CourseInstance.start_date (date)
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            start_date = start.date()
            stmt = stmt.where(CourseInstance.start_date >= start_date)

    total = db.execute(stmt).scalar() or 0
    formatted = f"{total:,}"
    return {
        "id": "leadership-001",
        "label": "Active courses",
        "value": formatted,
        "helperText": "Courses active in the selected operating window",
        "tone": "success",
    }

def get_completed_courses_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of completed/closed courses, applying optional filters.
    Filters that do not map to CourseInstance fields are ignored.
    """
    from datetime import datetime, timedelta

    stmt = select(func.count(distinct(CourseInstance.id))).where(
        CourseInstance.status.in_(["COMPLETED", "CLOSED", "completed", "closed"])
    )

    # Filter by specific course instance
    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseInstance.id == int(params.courseInstance))

    # Filter by instructor via course_instructors relationship
    if params and params.instructor != "all":
        stmt = stmt.join(
            course_instructors,
            course_instructors.c.course_instance_id == CourseInstance.id,
        ).where(course_instructors.c.instructor_id == int(params.instructor))

    # Filter by lesson
    if params and params.lesson != "all":
        stmt = stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))

    # Filter by material
    if params and params.material != "all":
        stmt = stmt.join(
            CourseSelectionMaterialFile,
            CourseSelectionMaterialFile.course_instance_id == CourseInstance.id,
        ).where(CourseSelectionMaterialFile.id == params.material)

    # Filter by evaluation type
    if params and params.evaluationType != "all":
        stmt = stmt.join(
            CourseSelectionLessonRelease,
            CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
        ).join(
            EvaluationLessonQuiz,
            EvaluationLessonQuiz.quiz_id == CourseSelectionLessonRelease.content_id,
        ).where(EvaluationLessonQuiz.assessment_type == params.evaluationType)

    # Date range filter based on CourseInstance.start_date (date)
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            start_date = start.date()
            stmt = stmt.where(CourseInstance.start_date >= start_date)

    total = db.execute(stmt).scalar() or 0
    formatted = f"{total:,}"
    return {
        "id": "leadership-002",
        "label": "Completed courses",
        "value": formatted,
        "helperText": "Courses closed in the selected operating window",
        "tone": "success",
    }

def get_student_pass_fail_rate_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the pass/fail rate across quiz attempts, applying optional filters.
    Filters that do not map to the underlying tables are ignored.
    """
    from datetime import datetime, timedelta

    total_stmt = (
        select(func.count(QuizAttempt.id))
        .join(CourseSelectionLessonRelease,
              QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
        .where(CourseSelectionLessonRelease.content_type == "quiz")
    )
    passed_stmt = (
        select(func.count(QuizAttempt.id))
        .join(CourseSelectionLessonRelease,
              QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
        .join(EvaluationLessonQuiz,
              EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            QuizAttempt.score >= EvaluationLessonQuiz.pass_mark,
            EvaluationLessonQuiz.pass_mark > 0
        )
    )

    # Filter by specific course instance
    if params and params.courseInstance != "all":
        total_stmt = total_stmt.where(CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance))
        passed_stmt = passed_stmt.where(CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance))

    # Filter by instructor (via course_instructors relationship)
    if params and params.instructor != "all":
        total_stmt = (
            total_stmt.join(CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id)
            .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )
        passed_stmt = (
            passed_stmt.join(CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id)
            .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )

    # Filter by lesson
    if params and params.lesson != "all":
        total_stmt = total_stmt.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
        passed_stmt = passed_stmt.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))

    # Filter by evaluation type
    if params and params.evaluationType != "all":
        total_stmt = (
            total_stmt.join(EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
            .where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
        )
        passed_stmt = passed_stmt.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)

    # Filter by student. QuizAttempt.student_id is a users.id; the student
    # filter value is a profiles.id, so join through Profile (user_id is unique).
    if params and params.student != "all":
        total_stmt = (
            total_stmt.join(Profile, Profile.user_id == QuizAttempt.student_id)
            .where(Profile.id == int(params.student))
        )
        passed_stmt = (
            passed_stmt.join(Profile, Profile.user_id == QuizAttempt.student_id)
            .where(Profile.id == int(params.student))
        )

    # Date range filter on QuizAttempt.submitted_at
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            total_stmt = total_stmt.where(QuizAttempt.submitted_at >= start)
            passed_stmt = passed_stmt.where(QuizAttempt.submitted_at >= start)

    total = db.execute(total_stmt).scalar() or 0
    passed = db.execute(passed_stmt).scalar() or 0
    if total > 0:
        pass_pct = int(round((passed / total) * 100))
    else:
        pass_pct = 0
    fail_pct = 100 - pass_pct
    return {
        "id": "leadership-003",
        "label": "Student pass/fail rate",
        "value": f"{pass_pct}% / {fail_pct}%",
        "helperText": "Passed versus failed evaluations across active cohorts",
        "tone": "warning",
    }

def get_training_delays_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of class sessions delayed beyond the operating threshold,
    applying optional filters. Only filters that map to ClassSession fields are used.
    """
    from datetime import datetime, timedelta

    stmt = (
        select(func.count(ClassSession.id))
        .where(
            ClassSession.actual_start.is_not(None),
            func.extract(
                "epoch",
                ClassSession.actual_start - ClassSession.scheduled_start,
            ) > 300
        )
    )

    # Filter by instructor (host_user_id is a users.id; instructor filter is a
    # profiles.id, so join through Profile).
    if params and params.instructor != "all":
        stmt = (
            stmt.join(Profile, Profile.user_id == ClassSession.host_user_id)
            .where(Profile.id == int(params.instructor))
        )

    # Date range filter on scheduled_start
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            stmt = stmt.where(ClassSession.scheduled_start >= start)

    total = db.execute(stmt).scalar() or 0
    formatted = f"{total:,}"
    return {
        "id": "leadership-004",
        "label": "Training delays",
        "value": formatted,
        "helperText": "Sessions delayed beyond the operating threshold",
        "tone": "warning",
    }

def get_flight_simulator_hours_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return planned vs completed flight/simulator hours, applying optional filters.
    Only filters that map to ClassSession fields are used.
    """
    from datetime import datetime, timedelta

    planned_stmt = select(
        func.sum(
            func.extract(
                "epoch",
                ClassSession.scheduled_end - ClassSession.scheduled_start,
            )
        )
    )
    completed_stmt = select(
        func.sum(
            func.extract(
                "epoch",
                ClassSession.actual_end - ClassSession.actual_start,
            )
        )
    ).where(
        ClassSession.actual_start.is_not(None),
        ClassSession.actual_end.is_not(None)
    )

    # Filter by instructor (host_user_id is a users.id; instructor filter is a
    # profiles.id, so join through Profile). Applied to both statements.
    if params and params.instructor != "all":
        planned_stmt = (
            planned_stmt.join(Profile, Profile.user_id == ClassSession.host_user_id)
            .where(Profile.id == int(params.instructor))
        )
        completed_stmt = (
            completed_stmt.join(Profile, Profile.user_id == ClassSession.host_user_id)
            .where(Profile.id == int(params.instructor))
        )

    # Date range filter on scheduled_start (planned) / actual_start (completed)
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            planned_stmt = planned_stmt.where(ClassSession.scheduled_start >= start)
            completed_stmt = completed_stmt.where(ClassSession.actual_start >= start)

    planned_seconds = db.execute(planned_stmt).scalar() or 0
    planned_hours = round(planned_seconds / 3600, 1)
    completed_seconds = db.execute(completed_stmt).scalar() or 0
    completed_hours = round(completed_seconds / 3600, 1)
    value = f"{planned_hours:,} / {completed_hours:,}"
    return {
        "id": "leadership-005",
        "label": "Flight/simulator hrs planned vs completed",
        "value": value,
        "helperText": "Planned training hours compared with completed hours",
        "tone": "warning",
    }

def get_weak_students_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of distinct students failing their evaluations, applying
    optional filters. Filters that do not map to the underlying tables are ignored.
    """
    from datetime import datetime, timedelta

    stmt = (
        select(func.count(distinct(QuizAttempt.student_id)))
        .join(
            CourseSelectionLessonRelease,
            QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id,
        )
        .join(
            EvaluationLessonQuiz,
            EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id,
        )
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            EvaluationLessonQuiz.pass_mark > 0,
            QuizAttempt.score < EvaluationLessonQuiz.pass_mark,
        )
    )

    # Filter by specific course instance
    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance))

    # Filter by instructor (via course_instructors relationship)
    if params and params.instructor != "all":
        stmt = (
            stmt.join(CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id)
            .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )

    # Filter by lesson
    if params and params.lesson != "all":
        stmt = stmt.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))

    # Filter by evaluation type
    if params and params.evaluationType != "all":
        stmt = stmt.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)

    # Filter by student. QuizAttempt.student_id is a users.id; the student
    # filter value is a profiles.id, so join through Profile (user_id is unique).
    if params and params.student != "all":
        stmt = (
            stmt.join(Profile, Profile.user_id == QuizAttempt.student_id)
            .where(Profile.id == int(params.student))
        )

    # Date range filter on QuizAttempt.submitted_at
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            stmt = stmt.where(QuizAttempt.submitted_at >= start)

    total = db.execute(stmt).scalar() or 0
    formatted = f"{total:,}"
    return {
        "id": "leadership-006",
        "label": "Weak students",
        "value": formatted,
        "helperText": "Students requiring intervention across current cohorts",
        "tone": "danger",
    }

def get_material_effectiveness_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of distinct material files, applying optional filters.
    Only filters that map to CourseSelectionMaterialFile fields are used.
    """
    stmt = select(func.count(distinct(CourseSelectionMaterialFile.id))).select_from(CourseSelectionMaterialFile)

    # Filter by specific course instance
    if params and params.courseInstance != "all":
        stmt = stmt.where(CourseSelectionMaterialFile.course_instance_id == int(params.courseInstance))

    # Filter by lesson (material files carry an optional lesson_id)
    if params and params.lesson != "all":
        stmt = stmt.where(CourseSelectionMaterialFile.lesson_id == int(params.lesson))

    # Filter by a specific material file (UUID value)
    if params and params.material != "all":
        stmt = stmt.where(CourseSelectionMaterialFile.id == params.material)

    total = db.execute(stmt).scalar() or 0
    return {
        "id": "leadership-007",
        "label": "Material effectiveness",
        "value": f"{total:,}",
        "helperText": "Measured by usage and post-review lift",
        "tone": "warning",
    }

def get_evaluation_compliance_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the evaluation compliance rate: the percentage of released evaluation
    quizzes that students have completed. Applies optional filters; filters that
    do not map to the underlying tables are ignored.

    Denominator = ``CourseSelectionLessonRelease`` rows for evaluation quizzes
    (content_type 'quiz' whose quiz is an evaluation quiz). Numerator = those
    release rows with a matching ``CourseSelectionLessonCompletion``.
    """
    from datetime import datetime, timedelta

    # Released evaluation quizzes: quiz releases joined to the evaluation
    # association so only actual evaluations are counted.
    released_stmt = (
        select(func.count(CourseSelectionLessonRelease.id))
        .join(
            EvaluationLessonQuiz,
            EvaluationLessonQuiz.quiz_id == CourseSelectionLessonRelease.content_id,
        )
        .where(CourseSelectionLessonRelease.content_type == "quiz")
    )

    # Completed release rows: release rows that have a matching completion.
    completed_release_stmt = (
        select(func.count(CourseSelectionLessonRelease.id))
        .join(
            EvaluationLessonQuiz,
            EvaluationLessonQuiz.quiz_id == CourseSelectionLessonRelease.content_id,
        )
        .join(
            CourseSelectionLessonCompletion,
            (
                (CourseSelectionLessonCompletion.course_instance_id
                 == CourseSelectionLessonRelease.course_instance_id)
                & (CourseSelectionLessonCompletion.lesson_id
                   == CourseSelectionLessonRelease.lesson_id)
                & (CourseSelectionLessonCompletion.content_type
                   == CourseSelectionLessonRelease.content_type)
                & (CourseSelectionLessonCompletion.content_id
                   == CourseSelectionLessonRelease.content_id)
                & (CourseSelectionLessonCompletion.student_id
                   == CourseSelectionLessonRelease.student_id)
            ),
        )
        .where(CourseSelectionLessonRelease.content_type == "quiz")
    )

    def _apply_common_filters(s):
        # Filter by specific course instance
        if params and params.courseInstance != "all":
            s = s.where(CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance))
        # Filter by instructor (via course_instructors relationship)
        if params and params.instructor != "all":
            s = (
                s.join(CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id)
                .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
                .where(course_instructors.c.instructor_id == int(params.instructor))
            )
        # Filter by lesson
        if params and params.lesson != "all":
            s = s.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
        # Filter by evaluation type
        if params and params.evaluationType != "all":
            s = s.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
        # Filter by student (release.student_id is a profiles.id, matches the
        # student filter value directly).
        if params and params.student != "all":
            s = s.where(CourseSelectionLessonRelease.student_id == int(params.student))
        return s

    released = db.execute(_apply_common_filters(released_stmt)).scalar() or 0

    completed_stmt = _apply_common_filters(completed_release_stmt)
    # Date range filter on completion time (when the evaluation was fulfilled).
    # Applied only to the completed (numerator) statement: the released
    # denominator has no completion row to filter on.
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            completed_stmt = completed_stmt.where(
                CourseSelectionLessonCompletion.completed_at >= start
            )

    completed = db.execute(completed_stmt).scalar() or 0

    compliance = int(round((completed / released) * 100)) if released else 0
    return {
        "id": "leadership-008",
        "label": "Evaluation compliance",
        "value": f"{compliance}%",
        "helperText": "Released evaluations completed by students in scope",
        "tone": "success",
    }

def get_course_completion_rate_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the course completion rate, applying optional filters.
    Filters that do not map to CourseInstance fields are ignored.
    """
    from datetime import datetime, timedelta

    total_stmt = select(func.count(CourseInstance.id))
    completed_stmt = select(func.count(CourseInstance.id)).where(
        CourseInstance.status.in_(["COMPLETED", "CLOSED", "completed", "closed"])
    )

    # Filter by specific course instance
    if params and params.courseInstance != "all":
        total_stmt = total_stmt.where(CourseInstance.id == int(params.courseInstance))
        completed_stmt = completed_stmt.where(CourseInstance.id == int(params.courseInstance))

    # Filter by instructor via course_instructors relationship
    if params and params.instructor != "all":
        total_stmt = (
            total_stmt.join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )
        completed_stmt = (
            completed_stmt.join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )

    # Date range filter based on CourseInstance.start_date (date)
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            start_date = start.date()
            total_stmt = total_stmt.where(CourseInstance.start_date >= start_date)
            completed_stmt = completed_stmt.where(CourseInstance.start_date >= start_date)

    total = db.execute(total_stmt).scalar() or 0
    completed = db.execute(completed_stmt).scalar() or 0
    percent = int(round((completed / total) * 100)) if total else 0
    return {
        "id": "leadership-009",
        "label": "Course completion rate",
        "value": f"{percent}%",
        "helperText": "Percentage of courses completed in the selected window",
        "tone": "info",
    }

def get_instructor_workload_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the average planned teaching hours per instructor, applying optional
    filters. Only filters that map to ClassSession fields are used.
    """
    from datetime import datetime, timedelta

    total_seconds_stmt = select(
        func.sum(
            func.extract(
                "epoch",
                ClassSession.scheduled_end - ClassSession.scheduled_start,
            )
        )
    )
    instructor_cnt_stmt = select(func.count(distinct(ClassSession.host_user_id)))

    # Filter by instructor (host_user_id is a users.id; instructor filter is a
    # profiles.id, so join through Profile). Applied to both statements.
    if params and params.instructor != "all":
        total_seconds_stmt = (
            total_seconds_stmt.join(Profile, Profile.user_id == ClassSession.host_user_id)
            .where(Profile.id == int(params.instructor))
        )
        instructor_cnt_stmt = (
            instructor_cnt_stmt.join(Profile, Profile.user_id == ClassSession.host_user_id)
            .where(Profile.id == int(params.instructor))
        )

    # Date range filter on scheduled_start
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            total_seconds_stmt = total_seconds_stmt.where(ClassSession.scheduled_start >= start)
            instructor_cnt_stmt = instructor_cnt_stmt.where(ClassSession.scheduled_start >= start)

    total_seconds = db.execute(total_seconds_stmt).scalar() or 0
    instructor_cnt = db.execute(instructor_cnt_stmt).scalar() or 0
    avg_hours = round((total_seconds / 3600) / instructor_cnt, 1) if instructor_cnt else 0
    return {
        "helperText": "Average planned teaching hours per instructor",
        "label": "Instructor workload",
        "statusLabel": "Live",
        "values": [],
        "value": f"{avg_hours} hrs",
    }

def get_repeated_weak_lessons_section(db: Session, params: DashboardFilterState = None) -> dict:
    """
    Return the count of lessons flagged as weak in multiple cohorts, applying
    optional filters. Filters that do not map to the underlying tables are ignored.
    """
    from datetime import datetime, timedelta

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

    # Filter by specific course instance
    if params and params.courseInstance != "all":
        weak_subq = weak_subq.where(
            CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
        )

    # Filter by instructor (via course_instructors relationship)
    if params and params.instructor != "all":
        weak_subq = (
            weak_subq.join(CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id)
            .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )

    # Filter by lesson
    if params and params.lesson != "all":
        weak_subq = weak_subq.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))

    # Filter by evaluation type
    if params and params.evaluationType != "all":
        weak_subq = weak_subq.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)

    # Filter by student. QuizAttempt.student_id is a users.id; the student
    # filter value is a profiles.id, so join through Profile (user_id is unique).
    if params and params.student != "all":
        weak_subq = (
            weak_subq.join(Profile, Profile.user_id == QuizAttempt.student_id)
            .where(Profile.id == int(params.student))
        )

    # Date range filter on QuizAttempt.submitted_at
    if params and params.dateRange != "all":
        now = datetime.utcnow()
        if params.dateRange == "24h":
            start = now - timedelta(hours=24)
        elif params.dateRange == "7d":
            start = now - timedelta(days=7)
        elif params.dateRange == "30d":
            start = now - timedelta(days=30)
        else:
            start = None
        if start:
            weak_subq = weak_subq.where(QuizAttempt.submitted_at >= start)

    weak_subq = weak_subq.group_by(CourseSelectionLessonRelease.lesson_id).subquery()
    stmt = select(func.count()).where(weak_subq.c.cohort_cnt > 1)
    count = db.execute(stmt).scalar() or 0
    return {
        "id": "leadership-011",
        "label": "Repeated weak lessons",
        "value": f"{count}",
        "helperText": "Lessons flagged as weak in multiple cohorts",
        "tone": "warning",
    }

def get_api_export_readiness_section(db: Session, params: DashboardFilterState = None) -> dict:
    # kpi = get_api_export_kpis(db)
    return {
        "id": "leadership-012",
        "label": "API export readiness",
        # "value": kpi["value"],
        "value": "0",
        "helperText": "Readiness of API export payloads",
        "tone": "success",
    }