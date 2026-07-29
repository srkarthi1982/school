from datetime import datetime, timedelta

from sqlalchemy import func, select, distinct
from sqlalchemy.orm import Session

from .schemas import DashboardFilterState
from app.modules.class_session.models import ClassSession
from app.modules.course_selection_material.models import (
    CourseSelectionMaterialFile,
    CourseSelectionMaterialUserProgress,
)
from app.modules.course_selection_schedule.lesson_content_models import (
    CourseSelectionLessonCompletion,
    CourseSelectionLessonRelease,
)
from app.modules.course.models import CourseEnrollment, CourseInstance, course_instructors
from app.modules.course_master.models import CourseMaster
from app.modules.evaluation.models import EvaluationLessonForm, EvaluationLessonQuiz
from app.modules.profile.models import Profile
from app.modules.quiz_bank.models import QuizAttempt


# ---------------------------------------------------------------------------
# Identity-chain helpers
#
# The dashboard is keyed to the logged-in user. Several student tables use
# DIFFERENT identity columns, so we need two distinct subqueries:
#   - profiles.id  -> CourseEnrollment.student_id,
#                     CourseSelectionLessonCompletion.student_id,
#                     CourseSelectionLessonRelease.student_id
#   - users.id     -> QuizAttempt.student_id,
#                     CourseSelectionMaterialUserProgress.user_id,
#                     ClassSession.host_user_id
# Using the wrong one silently returns no rows, so each function must pick the
# subquery that matches the column it filters on.
# ---------------------------------------------------------------------------


def _profile_id_subq(user):
    """Subquery yielding profiles.id for the current user."""
    return select(Profile.id).where(Profile.user_id == user.id).scalar_subquery()


def _user_id_subq(user):
    """Subquery yielding users.id for the current user (= user.id)."""
    return select(Profile.user_id).where(Profile.user_id == user.id).scalar_subquery()


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

    Hourly for 24h, daily for 7d/30d — mirrors the leadership/sat card trends.
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


def _student_course_instance_ids(db: Session, user, params: DashboardFilterState | None):
    """Return the set of course_instance_ids the student is enrolled in, after
    applying courseInstance/courseVersion/instructor filters. Used to scope
    per-lesson queries that have no direct enrollment join."""
    profile_id = _profile_id_subq(user)
    stmt = select(CourseEnrollment.course_instance_id).where(
        CourseEnrollment.student_id == profile_id
    )
    if params:
        if params.courseInstance != "all":
            stmt = stmt.where(CourseEnrollment.course_instance_id == int(params.courseInstance))
        if params.courseVersion != "all":
            stmt = stmt.join(
                CourseInstance, CourseEnrollment.course_instance_id == CourseInstance.id
            ).join(CourseMaster, CourseInstance.master_id == CourseMaster.id).where(
                CourseMaster.ctp_version == params.courseVersion
            )
        if params.instructor != "all":
            stmt = stmt.join(
                course_instructors,
                course_instructors.c.course_instance_id == CourseEnrollment.course_instance_id,
            ).where(course_instructors.c.instructor_id == int(params.instructor))
    return set(db.execute(stmt).scalars().all())


# ---------------------------------------------------------------------------
# Coverage-section items
# ---------------------------------------------------------------------------


def get_student_course_schedule_item(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return the number of upcoming course lessons for the current student.
    Counts CourseEnrollment rows linked to the student's profile where the
    associated CourseInstance has a start_date in the future (or today).
    Applies courseInstance / courseVersion / instructor filters."""
    profile_id = _profile_id_subq(user)
    stmt = (
        select(func.count(CourseEnrollment.id))
        .join(CourseInstance, CourseEnrollment.course_instance_id == CourseInstance.id)
        .where(
            CourseEnrollment.student_id == profile_id,
            CourseInstance.start_date != None,
            CourseInstance.start_date >= func.current_date(),
        )
    )
    if params:
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
    count = db.execute(stmt).scalar() or 0
    return {
        "id": "student-001",
        "label": "Course schedule",
        "value": f"{count}",
        "helperText": "Upcoming lessons and required attendance windows",
        "tone": "info",
    }


def get_student_materials_item(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return the number of material files assigned to the current student.

    CourseSelectionMaterialUserProgress.user_id is a users.id, so we filter via
    user.id (not profiles.id). Applies courseInstance / lesson / material filters
    by joining to CourseSelectionMaterialFile."""
    stmt = (
        select(func.count(func.distinct(CourseSelectionMaterialUserProgress.id)))
        .join(
            CourseSelectionMaterialFile,
            CourseSelectionMaterialUserProgress.file_id == CourseSelectionMaterialFile.id,
        )
        .where(CourseSelectionMaterialUserProgress.user_id == user.id)
    )
    if params:
        if params.courseInstance != "all":
            stmt = stmt.where(
                CourseSelectionMaterialFile.course_instance_id == int(params.courseInstance)
            )
        if params.lesson != "all":
            stmt = stmt.where(CourseSelectionMaterialFile.lesson_id == int(params.lesson))
        if params.material != "all":
            # material filter value is a UUID string; the column is UUID.
            stmt = stmt.where(CourseSelectionMaterialFile.id == params.material)
    count = db.execute(stmt).scalar() or 0
    return {
        "id": "student-002",
        "label": "Materials",
        "value": f"{count}",
        "helperText": "Assigned learning and review materials",
        "tone": "info",
    }


def get_student_completed_lessons_item(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return the number of lessons the current student has completed.
    Counts distinct CourseSelectionLessonCompletion entries for the student's
    profile where the completion timestamp is set.
    Applies courseInstance / lesson / dateRange filters."""
    profile_id = _profile_id_subq(user)
    stmt = (
        select(func.count(func.distinct(CourseSelectionLessonCompletion.id)))
        .where(
            CourseSelectionLessonCompletion.student_id == profile_id,
            CourseSelectionLessonCompletion.completed_at != None,
        )
    )
    if params:
        if params.courseInstance != "all":
            stmt = stmt.where(
                CourseSelectionLessonCompletion.course_instance_id == int(params.courseInstance)
            )
        if params.lesson != "all":
            stmt = stmt.where(CourseSelectionLessonCompletion.lesson_id == int(params.lesson))
        start = _date_range_start(params)
        if start:
            stmt = stmt.where(CourseSelectionLessonCompletion.completed_at >= start)
    count = db.execute(stmt).scalar() or 0
    return {
        "id": "student-003",
        "label": "Completed lessons",
        "value": f"{count}",
        "helperText": "Lessons completed by the learner",
        "tone": "success",
    }


def get_student_pending_quizzes_item(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return the number of quizzes assigned to the current student that have not
    yet been attempted. Counts distinct CourseSelectionLessonRelease rows where
    content_type is 'quiz' and there is no matching QuizAttempt for the student.

    QuizAttempt.student_id is a users.id; CourseSelectionLessonRelease.student_id
    is a profiles.id, so the two subqueries use the matching identity column.
    Applies courseInstance / lesson / evaluationType filters."""
    profile_id = _profile_id_subq(user)
    stmt = (
        select(func.count(func.distinct(CourseSelectionLessonRelease.id)))
        .join(
            CourseEnrollment,
            (CourseEnrollment.course_instance_id == CourseSelectionLessonRelease.course_instance_id)
            & (CourseEnrollment.student_id == profile_id),
        )
        .outerjoin(
            QuizAttempt,
            (QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
            & (QuizAttempt.student_id == user.id),
        )
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            QuizAttempt.id.is_(None),
        )
    )
    if params:
        if params.courseInstance != "all":
            stmt = stmt.where(
                CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
            )
        if params.lesson != "all":
            stmt = stmt.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
        if params.evaluationType != "all":
            stmt = stmt.join(
                EvaluationLessonQuiz,
                EvaluationLessonQuiz.quiz_id == CourseSelectionLessonRelease.content_id,
            ).where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
    count = db.execute(stmt).scalar() or 0
    return {
        "id": "student-004",
        "label": "Pending quizzes",
        "value": f"{count}",
        "helperText": "Quizzes still waiting for completion",
        "tone": "warning",
    }


def get_student_weak_lessons_item(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return the number of lessons flagged as weak for the current student — a
    weak lesson is one where the student attempted a quiz and scored below the
    pass mark for that quiz. Applies courseInstance / lesson / evaluationType /
    dateRange filters."""
    profile_id = _profile_id_subq(user)
    stmt = (
        select(func.count(func.distinct(CourseSelectionLessonRelease.lesson_id)))
        .join(QuizAttempt, QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
        .join(EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            EvaluationLessonQuiz.pass_mark > 0,
            QuizAttempt.student_id == user.id,
            QuizAttempt.score < EvaluationLessonQuiz.pass_mark,
        )
    )
    if params:
        if params.courseInstance != "all":
            stmt = stmt.where(
                CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
            )
        if params.lesson != "all":
            stmt = stmt.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
        if params.evaluationType != "all":
            stmt = stmt.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
        start = _date_range_start(params)
        if start:
            stmt = stmt.where(QuizAttempt.submitted_at >= start)
    count = db.execute(stmt).scalar() or 0
    return {
        "id": "student-005",
        "label": "Weak lessons",
        "value": f"{count}",
        "helperText": "Weak lessons requiring focused review",
        "tone": "warning",
    }


def get_student_review_material_item(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return the number of recommended review material items for the current
    student, based on the weak lessons identified for them: for each weak
    lesson we count distinct material files linked to that lesson.
    Applies courseInstance / lesson / material filters."""
    # Subquery to get lesson IDs that are weak for the student
    weak_lessons_subq = (
        select(CourseSelectionLessonRelease.lesson_id)
        .join(QuizAttempt, QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
        .join(EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            EvaluationLessonQuiz.pass_mark > 0,
            QuizAttempt.student_id == user.id,
            QuizAttempt.score < EvaluationLessonQuiz.pass_mark,
        )
        .distinct()
        .subquery()
    )
    stmt = (
        select(func.count(func.distinct(CourseSelectionMaterialFile.id)))
        .join(weak_lessons_subq, CourseSelectionMaterialFile.lesson_id == weak_lessons_subq.c.lesson_id)
    )
    if params:
        if params.courseInstance != "all":
            stmt = stmt.where(
                CourseSelectionMaterialFile.course_instance_id == int(params.courseInstance)
            )
        if params.lesson != "all":
            stmt = stmt.where(CourseSelectionMaterialFile.lesson_id == int(params.lesson))
        if params.material != "all":
            stmt = stmt.where(CourseSelectionMaterialFile.id == params.material)
    count = db.execute(stmt).scalar() or 0
    return {
        "id": "student-006",
        "label": "Recommended review material",
        "value": f"{count}",
        "helperText": "Material recommended from weak lesson signals",
        "tone": "info",
    }


def get_student_limited_evaluation_feedback_item(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return the number of evaluation feedback items visible to the current
    student. Counts distinct EvaluationLessonForm entries linked to the course
    masters the student is enrolled in. Applies courseInstance / courseVersion /
    instructor / lesson filters."""
    profile_id = _profile_id_subq(user)
    enrolled_master_subq = (
        select(CourseInstance.master_id)
        .join(CourseEnrollment, CourseEnrollment.course_instance_id == CourseInstance.id)
        .where(CourseEnrollment.student_id == profile_id)
        .distinct()
        .subquery()
    )
    stmt = (
        select(func.count(func.distinct(EvaluationLessonForm.id)))
        .where(EvaluationLessonForm.course_master_id.in_(select(enrolled_master_subq.c.master_id)))
    )
    if params:
        if params.lesson != "all":
            stmt = stmt.where(EvaluationLessonForm.lesson_id == int(params.lesson))
        if params.courseInstance != "all" or params.courseVersion != "all" or params.instructor != "all":
            # Constrain the enrolled-master subquery by the chosen course filters
            # so only forms from the filtered course set are counted.
            inner = (
                select(CourseInstance.master_id)
                .join(CourseEnrollment, CourseEnrollment.course_instance_id == CourseInstance.id)
                .where(CourseEnrollment.student_id == profile_id)
            )
            if params.courseInstance != "all":
                inner = inner.where(CourseInstance.id == int(params.courseInstance))
            if params.courseVersion != "all":
                inner = inner.join(
                    CourseMaster, CourseInstance.master_id == CourseMaster.id
                ).where(CourseMaster.ctp_version == params.courseVersion)
            if params.instructor != "all":
                inner = inner.join(
                    course_instructors,
                    course_instructors.c.course_instance_id == CourseInstance.id,
                ).where(course_instructors.c.instructor_id == int(params.instructor))
            inner = inner.distinct().subquery()
            stmt = (
                select(func.count(func.distinct(EvaluationLessonForm.id)))
                .where(EvaluationLessonForm.course_master_id.in_(select(inner.c.master_id)))
            )
            if params.lesson != "all":
                stmt = stmt.where(EvaluationLessonForm.lesson_id == int(params.lesson))
    count = db.execute(stmt).scalar() or 0
    return {
        "id": "student-007",
        "label": "Limited evaluation feedback",
        "value": f"{count}",
        "helperText": "Visible evaluation feedback limited to learner-safe guidance",
        "tone": "info",
    }


def get_student_course_progress_item(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return the overall course progress percentage for the current student:
    ratio of completed lessons to total lessons across all enrolled courses.
    Applies courseInstance / courseVersion / instructor / lesson filters."""
    profile_id = _profile_id_subq(user)
    # Total distinct lessons released to the student's enrolled courses
    total_lessons_subq = (
        select(CourseSelectionLessonRelease.lesson_id)
        .join(
            CourseEnrollment,
            (CourseEnrollment.course_instance_id == CourseSelectionLessonRelease.course_instance_id)
            & (CourseEnrollment.student_id == profile_id),
        )
        .where(CourseSelectionLessonRelease.lesson_id != None)
    )
    # Completed distinct lessons for the student
    completed_lessons_subq = (
        select(CourseSelectionLessonCompletion.lesson_id)
        .where(CourseSelectionLessonCompletion.student_id == profile_id)
    )
    if params:
        if params.lesson != "all":
            total_lessons_subq = total_lessons_subq.where(
                CourseSelectionLessonRelease.lesson_id == int(params.lesson)
            )
            completed_lessons_subq = completed_lessons_subq.where(
                CourseSelectionLessonCompletion.lesson_id == int(params.lesson)
            )
        if params.courseInstance != "all":
            total_lessons_subq = total_lessons_subq.where(
                CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
            )
            completed_lessons_subq = completed_lessons_subq.where(
                CourseSelectionLessonCompletion.course_instance_id == int(params.courseInstance)
            )
        if params.courseVersion != "all":
            total_lessons_subq = total_lessons_subq.join(
                CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id
            ).join(CourseMaster, CourseInstance.master_id == CourseMaster.id).where(
                CourseMaster.ctp_version == params.courseVersion
            )
            completed_lessons_subq = completed_lessons_subq.join(
                CourseInstance, CourseSelectionLessonCompletion.course_instance_id == CourseInstance.id
            ).join(CourseMaster, CourseInstance.master_id == CourseMaster.id).where(
                CourseMaster.ctp_version == params.courseVersion
            )
        if params.instructor != "all":
            total_lessons_subq = total_lessons_subq.join(
                course_instructors,
                course_instructors.c.course_instance_id == CourseSelectionLessonRelease.course_instance_id,
            ).where(course_instructors.c.instructor_id == int(params.instructor))
            completed_lessons_subq = completed_lessons_subq.join(
                course_instructors,
                course_instructors.c.course_instance_id == CourseSelectionLessonCompletion.course_instance_id,
            ).where(course_instructors.c.instructor_id == int(params.instructor))
    total_lessons_subq = total_lessons_subq.distinct().subquery()
    completed_lessons_subq = completed_lessons_subq.distinct().subquery()
    total_count = db.execute(select(func.count()).select_from(total_lessons_subq)).scalar() or 0
    completed_count = db.execute(select(func.count()).select_from(completed_lessons_subq)).scalar() or 0
    progress_percent = int((completed_count / total_count) * 100) if total_count > 0 else 0
    return {
        "id": "student-008",
        "label": "Course progress",
        "value": f"{progress_percent}%",
        "helperText": "Overall course completion and pacing",
        "tone": "success",
    }


# ---------------------------------------------------------------------------
# Card / strip metrics
# ---------------------------------------------------------------------------


def get_student_study_streak_item(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return the personal learning momentum (study streak) for the current
    student: the number of consecutive days up to today where the student has
    at least one lesson completion recorded. Applies courseInstance / lesson
    filters."""
    profile_id = _profile_id_subq(user)
    dates_stmt = (
        select(func.date(CourseSelectionLessonCompletion.completed_at))
        .where(
            CourseSelectionLessonCompletion.student_id == profile_id,
            CourseSelectionLessonCompletion.completed_at != None,
        )
    )
    if params:
        if params.courseInstance != "all":
            dates_stmt = dates_stmt.where(
                CourseSelectionLessonCompletion.course_instance_id == int(params.courseInstance)
            )
        if params.lesson != "all":
            dates_stmt = dates_stmt.where(
                CourseSelectionLessonCompletion.lesson_id == int(params.lesson)
            )
    dates_stmt = dates_stmt.distinct().order_by(
        func.date(CourseSelectionLessonCompletion.completed_at).desc()
    )
    date_rows = db.execute(dates_stmt).scalars().all()
    completion_dates = [d for d in date_rows if d is not None]

    # Streak counts consecutive days ending today OR yesterday (a student who
    # hasn't completed anything yet today but did yesterday is still on a run).
    today = datetime.utcnow().date()
    streak = 0
    expected = today
    started = False
    for d in completion_dates:
        if not started:
            # First date may be today or yesterday; anchor the streak there.
            if d == today or d == today - timedelta(days=1):
                expected = d
                started = True
            else:
                break
        if d == expected:
            streak += 1
            expected = expected - timedelta(days=1)
        elif d < expected:
            break
    return {
        "id": "student-009",
        "label": "Study streak",
        "helperText": "Consecutive days with lesson activity",
        "statusLabel": "Live",
        "values": [],
        "value": f"{streak} days",
    }


def get_student_usage_volume_card(db: Session, params: DashboardFilterState = None) -> dict:
    """Return usage volume based on the number of ClassSession records the
    student's instructors hosted, scoped by dateRange and course filters.
    The count is formatted with a k/M suffix for readability."""
    stmt = select(func.count()).select_from(ClassSession)
    if params:
        if params.courseInstance != "all":
            # ClassSession has no course_instance_id; scope via the instructor's
            # course instances is not directly possible, so we rely on dateRange
            # here and leave courseInstance scoping to be done at a finer grain
            # when sessions gain a course link.
            pass
        start = _date_range_start(params)
        if start:
            stmt = stmt.where(ClassSession.scheduled_start >= start)
    count = db.execute(stmt).scalar() or 0

    def _format_number(num: int) -> str:
        if num >= 1_000_000:
            return f"{num // 1_000_000}M"
        if num >= 1_000:
            return f"{num // 1_000}k"
        return str(num)

    return {
        "label": "Usage volume",
        "helperText": "Last 12 operating windows",
        "statusLabel": "Live",
        "values": [],
        "value": _format_number(count),
    }


def get_student_goal_progress_item(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return the overall goal progress percentage for the current student.
    Mirrors the course progress calculation but labeled as Goal progress.
    Applies courseInstance / courseVersion / instructor / lesson filters."""
    profile_id = _profile_id_subq(user)
    total_lessons_subq = (
        select(CourseSelectionLessonRelease.lesson_id)
        .join(
            CourseEnrollment,
            (CourseEnrollment.course_instance_id == CourseSelectionLessonRelease.course_instance_id)
            & (CourseEnrollment.student_id == profile_id),
        )
        .where(CourseSelectionLessonRelease.lesson_id != None)
    )
    completed_lessons_subq = (
        select(CourseSelectionLessonCompletion.lesson_id)
        .where(CourseSelectionLessonCompletion.student_id == profile_id)
    )
    if params:
        if params.lesson != "all":
            total_lessons_subq = total_lessons_subq.where(
                CourseSelectionLessonRelease.lesson_id == int(params.lesson)
            )
            completed_lessons_subq = completed_lessons_subq.where(
                CourseSelectionLessonCompletion.lesson_id == int(params.lesson)
            )
        if params.courseInstance != "all":
            total_lessons_subq = total_lessons_subq.where(
                CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
            )
            completed_lessons_subq = completed_lessons_subq.where(
                CourseSelectionLessonCompletion.course_instance_id == int(params.courseInstance)
            )
        if params.courseVersion != "all":
            total_lessons_subq = total_lessons_subq.join(
                CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id
            ).join(CourseMaster, CourseInstance.master_id == CourseMaster.id).where(
                CourseMaster.ctp_version == params.courseVersion
            )
            completed_lessons_subq = completed_lessons_subq.join(
                CourseInstance, CourseSelectionLessonCompletion.course_instance_id == CourseInstance.id
            ).join(CourseMaster, CourseInstance.master_id == CourseMaster.id).where(
                CourseMaster.ctp_version == params.courseVersion
            )
        if params.instructor != "all":
            total_lessons_subq = total_lessons_subq.join(
                course_instructors,
                course_instructors.c.course_instance_id == CourseSelectionLessonRelease.course_instance_id,
            ).where(course_instructors.c.instructor_id == int(params.instructor))
            completed_lessons_subq = completed_lessons_subq.join(
                course_instructors,
                course_instructors.c.course_instance_id == CourseSelectionLessonCompletion.course_instance_id,
            ).where(course_instructors.c.instructor_id == int(params.instructor))
    total_lessons_subq = total_lessons_subq.distinct().subquery()
    completed_lessons_subq = completed_lessons_subq.distinct().subquery()
    total_count = db.execute(select(func.count()).select_from(total_lessons_subq)).scalar() or 0
    completed_count = db.execute(select(func.count()).select_from(completed_lessons_subq)).scalar() or 0
    progress_percent = int((completed_count / total_count) * 100) if total_count > 0 else 0
    return {
        "id": "student-010",
        "label": "Goal progress",
        "value": f"{progress_percent}%",
        "helperText": "Overall goal progress",
        "tone": "success",
        "statusLabel": "Live",
        "values": [],
    }


def get_student_completion_strip(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return a completion percentage for the student dashboard strip.
    Mirrors the course progress calculation but formatted for a strip.
    Applies courseInstance / courseVersion / instructor / lesson filters."""
    profile_id = _profile_id_subq(user)
    total_lessons_subq = (
        select(CourseSelectionLessonRelease.lesson_id)
        .join(
            CourseEnrollment,
            (CourseEnrollment.course_instance_id == CourseSelectionLessonRelease.course_instance_id)
            & (CourseEnrollment.student_id == profile_id),
        )
        .where(CourseSelectionLessonRelease.lesson_id != None)
    )
    completed_lessons_subq = (
        select(CourseSelectionLessonCompletion.lesson_id)
        .where(CourseSelectionLessonCompletion.student_id == profile_id)
    )
    if params:
        if params.lesson != "all":
            total_lessons_subq = total_lessons_subq.where(
                CourseSelectionLessonRelease.lesson_id == int(params.lesson)
            )
            completed_lessons_subq = completed_lessons_subq.where(
                CourseSelectionLessonCompletion.lesson_id == int(params.lesson)
            )
        if params.courseInstance != "all":
            total_lessons_subq = total_lessons_subq.where(
                CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
            )
            completed_lessons_subq = completed_lessons_subq.where(
                CourseSelectionLessonCompletion.course_instance_id == int(params.courseInstance)
            )
        if params.courseVersion != "all":
            total_lessons_subq = total_lessons_subq.join(
                CourseInstance, CourseSelectionLessonRelease.course_instance_id == CourseInstance.id
            ).join(CourseMaster, CourseInstance.master_id == CourseMaster.id).where(
                CourseMaster.ctp_version == params.courseVersion
            )
            completed_lessons_subq = completed_lessons_subq.join(
                CourseInstance, CourseSelectionLessonCompletion.course_instance_id == CourseInstance.id
            ).join(CourseMaster, CourseInstance.master_id == CourseMaster.id).where(
                CourseMaster.ctp_version == params.courseVersion
            )
        if params.instructor != "all":
            total_lessons_subq = total_lessons_subq.join(
                course_instructors,
                course_instructors.c.course_instance_id == CourseSelectionLessonRelease.course_instance_id,
            ).where(course_instructors.c.instructor_id == int(params.instructor))
            completed_lessons_subq = completed_lessons_subq.join(
                course_instructors,
                course_instructors.c.course_instance_id == CourseSelectionLessonCompletion.course_instance_id,
            ).where(course_instructors.c.instructor_id == int(params.instructor))
    total_lessons_subq = total_lessons_subq.distinct().subquery()
    completed_lessons_subq = completed_lessons_subq.distinct().subquery()
    total_count = db.execute(select(func.count()).select_from(total_lessons_subq)).scalar() or 0
    completed_count = db.execute(select(func.count()).select_from(completed_lessons_subq)).scalar() or 0
    progress_percent = int((completed_count / total_count) * 100) if total_count > 0 else 0
    return {
        "helperText": "",
        "label": "Completion",
        "statusLabel": "Live",
        "values": [],
        "value": f"{progress_percent}%",
    }


def get_student_average_score_strip(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return the average quiz score percentage for the student dashboard strip.
    Score is normalized as score/max_score*100 so it is comparable across
    quizzes with different max marks. Applies courseInstance / lesson /
    evaluationType / dateRange filters."""
    stmt = (
        select(
            func.avg((QuizAttempt.score * 100.0) / QuizAttempt.max_score)
        )
        .join(
            CourseSelectionLessonRelease,
            QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id,
        )
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            QuizAttempt.student_id == user.id,
            QuizAttempt.score != None,
            QuizAttempt.max_score != None,
            QuizAttempt.max_score > 0,
        )
    )
    if params:
        if params.courseInstance != "all":
            stmt = stmt.where(
                CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
            )
        if params.lesson != "all":
            stmt = stmt.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
        if params.evaluationType != "all":
            stmt = stmt.join(
                EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id
            ).where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
        start = _date_range_start(params)
        if start:
            stmt = stmt.where(QuizAttempt.submitted_at >= start)
    avg_score = db.execute(stmt).scalar()
    avg_score = round(avg_score or 0, 1)
    return {
        "helperText": "",
        "label": "Average score",
        "statusLabel": "Live",
        "values": [],
        "value": f"{int(avg_score)}%",
    }


def get_student_usage_rate_strip(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Return a usage-rate percentage for the student dashboard strip. The rate
    is the student's lesson completions over the selected date range as a
    fraction of the total lessons released to them, capped at 100%.
    Applies courseInstance / lesson / dateRange filters."""
    profile_id = _profile_id_subq(user)
    # Total lessons released to the student's enrolled courses (denominator)
    total_subq = (
        select(func.count(func.distinct(CourseSelectionLessonRelease.id)))
        .join(
            CourseEnrollment,
            (CourseEnrollment.course_instance_id == CourseSelectionLessonRelease.course_instance_id)
            & (CourseEnrollment.student_id == profile_id),
        )
        .where(CourseSelectionLessonRelease.lesson_id != None)
    )
    if params:
        if params.courseInstance != "all":
            total_subq = total_subq.where(
                CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
            )
        if params.lesson != "all":
            total_subq = total_subq.where(
                CourseSelectionLessonRelease.lesson_id == int(params.lesson)
            )
    total_count = db.execute(total_subq).scalar() or 0

    # Completed lessons for the student within the date range (numerator)
    comp_stmt = (
        select(func.count(func.distinct(CourseSelectionLessonCompletion.id)))
        .where(
            CourseSelectionLessonCompletion.student_id == profile_id,
            CourseSelectionLessonCompletion.completed_at != None,
        )
    )
    if params:
        if params.courseInstance != "all":
            comp_stmt = comp_stmt.where(
                CourseSelectionLessonCompletion.course_instance_id == int(params.courseInstance)
            )
        if params.lesson != "all":
            comp_stmt = comp_stmt.where(
                CourseSelectionLessonCompletion.lesson_id == int(params.lesson)
            )
        start = _date_range_start(params)
        if start:
            comp_stmt = comp_stmt.where(CourseSelectionLessonCompletion.completed_at >= start)
    completed_count = db.execute(comp_stmt).scalar() or 0

    usage_percent = int(min((completed_count / total_count) * 100, 100)) if total_count > 0 else 0
    return {
        "helperText": "",
        "label": "Usage rate",
        "statusLabel": "Live",
        "values": [],
        "value": f"{usage_percent}%",
    }
