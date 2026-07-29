import math
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, desc, func, literal, or_, select
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import require_permission, get_current_user
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, Meta, ok
from app.core.schemas import paginate

from app.modules.profile.models import Profile
from app.modules.users.models import User
from app.modules.course_master.models import CourseMaster
from app.modules.course.models import (
    CourseEnrollment, CourseInstance, CourseOtherPersonnel, course_instructors
)
from app.modules.course_selection_material.models import (
    CourseSelectionMaterialFile,
    CourseSelectionMaterialUserProgress,
)
from app.modules.attendance.models import Attendance as AttendanceModel
from app.modules.attendance_status.models import AttendanceStatus as AttendanceStatusModel

from .models import ProgressCourse, ProgressMaterialRecord, ProgressQuizRecord
from .schemas import CourseStats, TeacherCourseStats

from app.modules.quiz_bank.models import Quiz, QuizAttempt
from app.modules.course_selection_schedule.lesson_content_models import (
    CourseSelectionLessonRelease,
    CourseSelectionLessonCompletion,
)
from app.modules.course_selection_currencies_certificate.models import (
    CourseSelectionInfoFlightPackage,
    CourseSelectionInfoFlightPackageTask,
)
from app.modules.currencies_certificate.models import FlightTaskMaster
from app.modules.grading.models import FlightPackGrade, FormGrade, SurveyGrade
from app.modules.form.models import Form, FormQuestion
from app.modules.course_selection_form.models import CourseSelectionFormFormLink, CourseSelectionFormSurveyLink
from app.modules.survey.models import Survey, SurveyQuestion

def _get_student_course_instance_ids(
    db: Session,
    student_user_id: int,
) -> set[int]:
    """
    Return the set of ``CourseInstance`` IDs a student is enrolled in.

    Performs a single efficient query:
    • Joins ``CourseEnrollment`` with ``Profile`` to map the user → student.
    • Filters by the supplied ``student_user_id``.
    • Uses ``distinct()`` to avoid duplicate IDs.
    • Retrieves scalar integers directly via ``.scalars()``.
    """
    if not student_user_id:
        return set()
    ci_ids = (
        db.query(CourseEnrollment.course_instance_id)
        .join(Profile, CourseEnrollment.student_id == Profile.id)
        .filter(Profile.user_id == student_user_id)
        .distinct()
        .all()
    )
    return set([r[0] for r in ci_ids])

router = APIRouter(prefix="/progress-tracker", tags=["Progress Tracker"])

# Known holidays — dates skipped in attendance calculations.
# Future: could read from a DB table instead.
KNOWN_HOLIDAYS: frozenset[str] = frozenset({
    "2025-07-26", "2025-07-27", "2025-07-28",  # Eid al-Fitr / Eid al-Adha
    "2025-10-01", "2025-11-30", "2025-12-01",  # Commemoration + National Day    
})


# ===================================================================
# Attendance helpers (inverse logic)
# ===================================================================


def _get_all_absent_records(db: Session, ci_ids: set[int], student_ids: set[int]) -> dict[tuple[int, int, date], str]:
    """Fetch absent/late/excused records from the real attendances table.
    Returns: {(ci_id, student_id, date): status, ...} — flat global map
    """
    if not ci_ids:
        return {}

    stmt = (
        db.query(
            CourseInstance.id.label("ci_id"),
            User.id.label("student_id"),
            AttendanceModel.date,
            AttendanceStatusModel.code,
        )
        .select_from(AttendanceModel)
        .join(User, AttendanceModel.student_id == User.id)
        .join(AttendanceStatusModel, AttendanceModel.status_id == AttendanceStatusModel.id)
        .join(
            CourseInstance,
            and_(
                AttendanceModel.date >= CourseInstance.start_date,
                AttendanceModel.date <= CourseInstance.end_date,
                CourseInstance.id.in_(list(ci_ids)),
            ),
        )
        .where(
            AttendanceStatusModel.code != "present",
        )
    )
    if student_ids:
            stmt = stmt.where(User.id.in_(list(student_ids)))

    stmt = stmt.distinct()

    result: dict[tuple[int, int, date], str] = {}
    for row in stmt.all():
        result[(row.ci_id, row.student_id, row.date)] = row.code

    return result


def _make_date_ranges(db: Session, ci_ids: set[int]) -> dict[int, tuple[date, date]]:
    result = []
    for ci in db.query(CourseInstance.id, CourseInstance.start_date, CourseInstance.end_date).filter(CourseInstance.id.in_(list(ci_ids))).all():
        result.append((ci[0], ci[1], ci[2]))
    return {ci_id: (sd, ed) for ci_id, sd, ed in result}


def _attendance_rate_single(
    start_date: date,
    end_date: date,
    student_id: int,
    absent_map: dict[tuple[int, date], str],
    holidays: frozenset[str] | None = None,
) -> float:
    if not start_date or not end_date or start_date > end_date:
        return 0.0

    if holidays is None:
        holidays = KNOWN_HOLIDAYS

    today = date.today()
    end_date = min(end_date, today)
    if start_date > end_date:
        return 0.0

    total_days = 0
    absent_days = 0
    current = start_date
    while current <= end_date:
        iso = current.isoformat()
        if iso not in holidays:
            day_of_week = current.weekday()
            if day_of_week < 5:  # skip Sat(5) Sun(6)
                total_days += 1
                if (student_id, current) in absent_map:
                    absent_days += 1
        current += timedelta(days=1)

    return round((total_days - absent_days) / max(1, total_days) * 100, 1)


def _course_attendance_rate(
    student_ids: set[int],
    start_date: date,
    end_date: date,
    absent_map: dict[tuple[int, date], str],
) -> float:
    if not student_ids or not start_date or not end_date or start_date > end_date:
        return 0.0

    rates = [
        _attendance_rate_single(start_date, end_date, sid, absent_map)
        for sid in student_ids
    ]
    return round(sum(rates) / len(rates), 1)


# ===================================================================
# Student identification helpers
# ===================================================================


def _get_student_ids_per_course(db: Session, ci_ids: set[int]) -> dict[int, set[int]]:
    """Map course_instance.id -> set of student user_ids enrolled in that course."""
    per_ci: dict[int, set[int]] = {}

    if not ci_ids:
        return per_ci

    ci_list = list(ci_ids)

    q = (
        db.query(CourseEnrollment.course_instance_id, Profile.user_id)
        .select_from(CourseEnrollment)
        .join(Profile, CourseEnrollment.student_id == Profile.id)
        .filter(CourseEnrollment.course_instance_id.in_(ci_list))
        .distinct()
    )
    for ci_id, user_id in q.all():
        per_ci.setdefault(ci_id, set()).add(user_id)

    return per_ci


# ===================================================================
# Standard helpers
# ===================================================================


def _build_title_map(db: Session, ci_ids: set[int]) -> dict[int, str]:
    if not ci_ids:
        return {}
    courses = db.query(CourseInstance).options(
        joinedload(CourseInstance.master).load_only(CourseMaster.title)
    ).filter(CourseInstance.id.in_(list(ci_ids))).all()
    return {ci.id: ci.master.title for ci in courses}


def _get_teacher_course_ids(db: Session, teacher_user_id: int) -> list[int]:
    """Return list of CourseInstance IDs where the user is an instructor or other personnel."""
    profile = db.query(Profile).filter(Profile.user_id == teacher_user_id).first()
    if not profile:
        return []
    pid = profile.id
    ids = set()
    # From course_instructors table
    for row in db.query(course_instructors.c.course_instance_id).filter(
        course_instructors.c.instructor_id == pid
    ).distinct().all():
        if row[0]:
            ids.add(row[0])
    # From course_other_personnel
    for row in db.query(CourseOtherPersonnel.course_instance_id).filter(
        CourseOtherPersonnel.profile_id == pid
    ).distinct().all():
        if row[0]:
            ids.add(row[0])
    return list(ids)


def _load_student_map(db: Session, student_ids: set[int]) -> dict[int, str]:
    if not student_ids:
        return {}
    profiles = db.query(Profile).filter(Profile.user_id.in_(list(student_ids))).all()
    return {p.user_id: f"{p.first_name} {p.middle_name or ''} {p.last_name or ''}".strip() for p in profiles}


def _get_quizzes_for_assessment(
    db: Session,
    course_ids: list[int],
    status_param: str,
    student_id: int | None,
) -> list[dict]:
    """
    Build quiz assessment items using a single query with ROW_NUMBER() for dedup.

    Joins releases → enrollments → profiles → attempts → completions in one pass.
    A quiz is considered completed if either a QuizAttempt or a
    CourseSelectionLessonCompletion record exists for the student.
    Uses a window function to deduplicate by (quiz, student).
    """
    base = (
        select(
            Quiz.id.label("quiz_id"),
            CourseSelectionLessonRelease.course_instance_id.label("ci_id"),
            CourseSelectionLessonRelease.released_at,
            Profile.user_id.label("student_id"),
            Profile.first_name,
            Profile.last_name,
            Quiz.name.label("quiz_name"),
            CourseInstance.title.label("course_name"),
            QuizAttempt.id.label("attempt_id"),
            QuizAttempt.score,
            QuizAttempt.max_score.label("total"),
            QuizAttempt.submitted_at,
            CourseSelectionLessonCompletion.id.label("completion_id"),
        )
        .select_from(CourseSelectionLessonRelease)
        .join(Quiz, Quiz.id == CourseSelectionLessonRelease.content_id)
        # Releases are per-student, so join the enrolment on BOTH the course and
        # the targeted student — a quiz assessment item exists only for a student
        # the quiz was actually released to.
        .join(CourseEnrollment, and_(
              CourseEnrollment.course_instance_id == CourseSelectionLessonRelease.course_instance_id,
              CourseEnrollment.student_id == CourseSelectionLessonRelease.student_id))
        .join(Profile, Profile.id == CourseEnrollment.student_id)
        .outerjoin(CourseInstance, CourseInstance.id == CourseSelectionLessonRelease.course_instance_id)
        .outerjoin(QuizAttempt, and_(
            QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id,
            QuizAttempt.student_id == Profile.user_id,
        ))
        .outerjoin(CourseSelectionLessonCompletion, and_(
            CourseSelectionLessonCompletion.course_instance_id == CourseSelectionLessonRelease.course_instance_id,
            CourseSelectionLessonCompletion.lesson_id == CourseSelectionLessonRelease.lesson_id,
            CourseSelectionLessonCompletion.content_type == CourseSelectionLessonRelease.content_type,
            CourseSelectionLessonCompletion.content_id == CourseSelectionLessonRelease.content_id,
            CourseSelectionLessonCompletion.student_id == Profile.user_id,
        ))
        .filter(
            CourseSelectionLessonRelease.course_instance_id.in_(course_ids),
            CourseSelectionLessonRelease.content_type == "quiz",
        )
    )

    if student_id is not None:
        base = base.where(Profile.user_id == student_id)
    if status_param == "completed":
        base = base.where(or_(
            QuizAttempt.id.isnot(None),
            CourseSelectionLessonCompletion.id.isnot(None),
        ))
    elif status_param == "pending":
        base = base.where(and_(
            QuizAttempt.id.is_(None),
            CourseSelectionLessonCompletion.id.is_(None),
        ))

    # Rank rows per (quiz, student): completion first, then attempt, by date
    rn = func.row_number().over(
        partition_by=[Quiz.id, Profile.user_id],
        order_by=[
            desc(case((CourseSelectionLessonCompletion.id.isnot(None), 2),
                       (QuizAttempt.id.isnot(None), 1),
                       else_=0)),
            desc(QuizAttempt.submitted_at),
            desc(CourseSelectionLessonCompletion.id),
        ]
    ).label("rn")

    ranked = base.add_columns(rn).subquery()
    final = select(*ranked.c).where(ranked.c.rn == 1)

    rows = db.execute(final).all()
    if not rows:
        return []

    return [
        {
            "assessment_type": "quiz",
            "id": r.quiz_id,
            "course_id": r.ci_id,
            "student_id": r.student_id,
            "course_name": r.course_name or f"Course {r.ci_id}",
            "student_name": f"{r.first_name} {r.last_name}".strip() or f"Student {r.student_id}",
            "title": r.quiz_name or f"Quiz {r.quiz_id}",
            "score": r.score,
            "total": r.total,
            "date": r.submitted_at.isoformat() if r.submitted_at else None,
            "released_at": r.released_at.isoformat() if r.released_at else None,
            "status": "completed" if (r.attempt_id is not None or r.completion_id is not None) else "pending",
        }
        for r in rows
    ]


def _get_flight_packages_for_assessment(
    db: Session,
    course_ids: list[int],
    status_param: str,
    student_id: int | None,
) -> list[dict]:
    """
    Build flight package task assessment items using a single query with ROW_NUMBER().

    Joins packages → tasks → task_master → enrollments → profiles → course_instance in one pass,
    using a left outer join to FlightPackGrade for score data. A task row is marked
    ``pending`` when the student has no grade record and ``completed`` when they do.
    """
    base = (
        select(
            CourseSelectionInfoFlightPackageTask.id.label("task_id"),
            CourseSelectionInfoFlightPackage.id.label("pack_id"),
            CourseSelectionInfoFlightPackage.course_instance_id.label("ci_id"),
            CourseSelectionInfoFlightPackage.created_at.label("package_created_at"),
            CourseSelectionInfoFlightPackage.name.label("package_name"),
            FlightTaskMaster.task_no.label("task_no"),
            FlightTaskMaster.task_description.label("task_description"),
            Profile.user_id.label("student_id"),
            Profile.first_name,
            Profile.last_name,
            CourseInstance.title.label("course_name"),
            FlightPackGrade.id.label("grade_id"),
            FlightPackGrade.score,
            FlightPackGrade.satisfied,
        )
        .select_from(CourseSelectionInfoFlightPackage)
        .join(CourseSelectionInfoFlightPackageTask,
              CourseSelectionInfoFlightPackageTask.package_id == CourseSelectionInfoFlightPackage.id)
        .join(FlightTaskMaster,
              FlightTaskMaster.id == CourseSelectionInfoFlightPackageTask.task_master_id)
        .join(CourseEnrollment,
              CourseEnrollment.course_instance_id == CourseSelectionInfoFlightPackage.course_instance_id)
        .join(Profile, Profile.id == CourseEnrollment.student_id)
        .outerjoin(CourseInstance, CourseInstance.id == CourseSelectionInfoFlightPackage.course_instance_id)
        .outerjoin(FlightPackGrade, and_(
            FlightPackGrade.course_instance_id == CourseSelectionInfoFlightPackage.course_instance_id,
            FlightPackGrade.student_id == Profile.user_id,
            FlightPackGrade.pack_id == CourseSelectionInfoFlightPackage.id,
            FlightPackGrade.task_id == CourseSelectionInfoFlightPackageTask.id,
        ))
        .filter(
            CourseSelectionInfoFlightPackage.course_instance_id.in_(course_ids),
        )
    )

    if student_id is not None:
        base = base.where(Profile.user_id == student_id)
    if status_param == "completed":
        base = base.where(FlightPackGrade.id.isnot(None))
    elif status_param == "pending":
        base = base.where(FlightPackGrade.id.is_(None))

    # Rank rows per (task, student): graded first, then by grade_id DESC
    rn = func.row_number().over(
        partition_by=[CourseSelectionInfoFlightPackageTask.id, Profile.user_id],
        order_by=[
            desc(FlightPackGrade.id),
        ]
    ).label("rn")

    ranked = base.add_columns(rn).subquery()
    final = select(*ranked.c).where(ranked.c.rn == 1)

    rows = db.execute(final).all()
    if not rows:
        return []

    return [
        {
            "assessment_type": "flight",
            "id": r.task_id,
            "course_id": r.ci_id,
            "student_id": r.student_id,
            "course_name": r.course_name or f"Course {r.ci_id}",
            "student_name": f"{r.first_name} {r.last_name}".strip() or f"Student {r.student_id}",
            "title": f"{r.package_name} – {r.task_no} {r.task_description}".strip() if r.package_name else f"Task {r.task_id}",
            "score": r.score,
            "total": 5,
            "date": r.package_created_at.isoformat() if r.package_created_at else None,
            "released_at": r.package_created_at.isoformat() if r.package_created_at else None,
            "status": "completed" if r.grade_id is not None else "pending",
        }
        for r in rows
    ]


def _get_forms_for_assessment(
    db: Session,
    course_ids: list[int],
    status_param: str,
    student_id: int | None,
) -> list[dict]:
    """
    Build form assessment items using two subqueries for aggregation.

    Subquery 'question_counts' aggregates COUNT(*) per form from form_questions.
    Subquery 'score_sums' aggregates SUM(score) per (form_id, student_id) from form_grades.
    The main query joins form_links → forms → enrollments → profiles → course_instances.
    """
    max_score = select(
        FormQuestion.form_id,
        func.count(FormQuestion.id).label("total"),
    ).where(FormQuestion.type == "text").group_by(FormQuestion.form_id).subquery()

    score_sums = select(
        FormGrade.form_id,
        FormGrade.student_id.label("grade_student_id"),
        func.coalesce(func.sum(FormGrade.score), 0).label("score"),
    ).group_by(FormGrade.form_id, FormGrade.student_id).subquery()

    base = (
        select(
            Form.id.label("form_id"),
            Form.title.label("form_title"),
            Form.created_at.label("form_created_at"),
            CourseSelectionFormFormLink.form_id.label("fl_form_id_ref"),
            CourseSelectionFormFormLink.course_instance_id.label("ci_id"),
            Profile.user_id.label("student_id"),
            Profile.first_name,
            Profile.last_name,
            CourseInstance.title.label("course_name"),
            max_score.c.total,
            score_sums.c.score,
            score_sums.c.grade_student_id,
        )
        .select_from(CourseSelectionFormFormLink)
        .join(Form, Form.id == CourseSelectionFormFormLink.form_id)
        .join(CourseEnrollment,
              CourseEnrollment.course_instance_id == CourseSelectionFormFormLink.course_instance_id)
        .join(Profile, Profile.id == CourseEnrollment.student_id)
        .outerjoin(CourseInstance, CourseInstance.id == CourseSelectionFormFormLink.course_instance_id)
        .outerjoin(max_score, max_score.c.form_id == Form.id)
        .outerjoin(score_sums, and_(
            score_sums.c.form_id == Form.id,
            score_sums.c.grade_student_id == Profile.user_id,
        ))
        .filter(
            CourseSelectionFormFormLink.course_instance_id.in_(course_ids),
        )
    )

    if student_id is not None:
        base = base.where(Profile.user_id == student_id)
    if status_param == "completed":
        base = base.where(score_sums.c.score.isnot(None), score_sums.c.score > 0)
    elif status_param == "pending":
        base = base.where(
            or_(
                score_sums.c.score.is_(None),
                score_sums.c.score == 0,
            )
        )

    rn = func.row_number().over(
        partition_by=[Form.id, Profile.user_id],
        order_by=[desc(Form.id)],
    ).label("rn")

    ranked = base.add_columns(rn).subquery()
    final = select(*ranked.c).where(ranked.c.rn == 1)

    rows = db.execute(final).all()
    if not rows:
        return []

    return [
        {
            "assessment_type": "form",
            "id": r.form_id,
            "course_id": r.ci_id,
            "student_id": r.student_id,
            "course_name": r.course_name or f"Course {r.ci_id}",
            "student_name": f"{r.first_name} {r.last_name}".strip() or f"Student {r.student_id}",
            "title": r.form_title or f"Form {r.form_id}",
            "score": r.score,
            "total": r.total or 0,
            "date": r.form_created_at.isoformat() if r.form_created_at else None,
            "released_at": r.form_created_at.isoformat() if r.form_created_at else None,
            "status": "completed" if (r.score is not None and r.score > 0) else "pending",
        }
        for r in rows
    ]


def _get_surveys_for_assessment(
    db: Session,
    course_ids: list[int],
    status_param: str,
    student_id: int | None,
) -> list[dict]:
    """
    Build survey assessment items using two subqueries for aggregation.

    Subquery 'question_counts' aggregates COUNT for text-type questions per survey.
    Subquery 'score_sums' aggregates SUM(score) per (survey_id, student_id).
    The main query joins survey_links → surveys → enrollments → profiles → course_instances.
    """
    question_counts = select(
        SurveyQuestion.survey_id,
        func.count(SurveyQuestion.id).label("total"),
    ).where(SurveyQuestion.type == "text").group_by(SurveyQuestion.survey_id).subquery()

    score_sums = select(
        SurveyGrade.survey_id,
        SurveyGrade.student_id.label("grade_student_id"),
        func.coalesce(func.sum(SurveyGrade.score), 0).label("score"),
    ).group_by(SurveyGrade.survey_id, SurveyGrade.student_id).subquery()

    base = (
        select(
            Survey.id.label("survey_id"),
            Survey.title.label("survey_title"),
            Survey.created_at.label("survey_created_at"),
            CourseSelectionFormSurveyLink.course_instance_id.label("ci_id"),
            Profile.user_id.label("student_id"),
            Profile.first_name,
            Profile.last_name,
            CourseInstance.title.label("course_name"),
            question_counts.c.total,
            score_sums.c.score,
            score_sums.c.grade_student_id,
        )
        .select_from(CourseSelectionFormSurveyLink)
        .join(Survey, Survey.id == CourseSelectionFormSurveyLink.survey_id)
        .join(CourseEnrollment,
              CourseEnrollment.course_instance_id == CourseSelectionFormSurveyLink.course_instance_id)
        .join(Profile, Profile.id == CourseEnrollment.student_id)
        .outerjoin(CourseInstance, CourseInstance.id == CourseSelectionFormSurveyLink.course_instance_id)
        .outerjoin(question_counts, question_counts.c.survey_id == Survey.id)
        .outerjoin(score_sums, and_(
            score_sums.c.survey_id == Survey.id,
            score_sums.c.grade_student_id == Profile.user_id,
        ))
        .filter(
            CourseSelectionFormSurveyLink.course_instance_id.in_(course_ids),
        )
    )

    if student_id is not None:
        base = base.where(Profile.user_id == student_id)
    if status_param == "completed":
        base = base.where(score_sums.c.score.isnot(None), score_sums.c.score > 0)
    elif status_param == "pending":
        base = base.where(
            or_(
                score_sums.c.score.is_(None),
                score_sums.c.score == 0,
            )
        )

    rn = func.row_number().over(
        partition_by=[Survey.id, Profile.user_id],
        order_by=[desc(Survey.id)],
    ).label("rn")

    ranked = base.add_columns(rn).subquery()
    final = select(*ranked.c).where(ranked.c.rn == 1)

    rows = db.execute(final).all()
    if not rows:
        return []

    return [
        {
            "assessment_type": "survey",
            "id": r.survey_id,
            "course_id": r.ci_id,
            "student_id": r.student_id,
            "course_name": r.course_name or f"Course {r.ci_id}",
            "student_name": f"{r.first_name} {r.last_name}".strip() or f"Student {r.student_id}",
            "title": r.survey_title or f"Survey {r.survey_id}",
            "score": r.score,
            "total": r.total or 0,
            "date": r.survey_created_at.isoformat() if r.survey_created_at else None,
            "released_at": r.survey_created_at.isoformat() if r.survey_created_at else None,
            "status": "completed" if (r.score is not None and r.score > 0) else "pending",
        }
        for r in rows
    ]


# ===================================================================
# Stats computation
# ===================================================================


def _compute_course_stats(
    course_instance: CourseInstance,
    student_ids: set[int],
    start_date: date | None,
    end_date: date | None,
    absent_map: dict[tuple[int, date], str],
    quizzes: list[dict],
    materials: list[dict],
    course_name: str,
) -> CourseStats:
    att_rate = _course_attendance_rate(student_ids, start_date or date.today(), end_date or date.today(), absent_map)

    completed_quizzes = [q for q in quizzes if q.get("score") is not None and (q.get("total") or 0) > 0]
    quiz_average = round(
        sum((q.get("score") or 0) / q.get("total", 1) * 100 for q in completed_quizzes) / max(1, len(completed_quizzes)), 1
    ) if completed_quizzes else 0.0

    m_rate = round(
        sum(1 for m in materials if m.get("is_completed", False)) / max(1, len(materials)) * 100, 1
    ) if materials else 0.0

    overall_progress = round((att_rate + quiz_average + m_rate) / 3, 1)

    return CourseStats(
        course_id=course_instance.id,
        course_name=course_name,
        teacher_name="",
        color="",
        attendance_rate=att_rate,
        quiz_average=quiz_average,
        materials_completed=sum(1 for m in materials if m.get("completed", False)),
        materials_total=len(materials),
        materials_completion_rate=m_rate,
        overall_progress=overall_progress,
    )


def _compute_per_student_stats(
    student_id: int,
    start_date: date | None,
    end_date: date | None,
    absent_map: dict[tuple[int, date], str],
    quizzes: list[dict],
    materials: list[dict],
) -> dict:
    att_rate = _attendance_rate_single(start_date or date.today(), end_date or date.today(), student_id, absent_map)
    qz = [q for q in quizzes if q.get("student_id") == student_id and (q.get("score") is not None)]
    q_avg = round(sum((q.get("score") or 0) / q.get("total", 1) * 100 for q in qz) / max(1, len(qz)), 1) if qz else 0.0
    mt = [m for m in materials if m.get("user_id") == student_id]
    m_rate = round(sum(1 for m in mt if m.get("is_completed")) / max(1, len(mt)) * 100, 1) if mt else 0.0
    return {"att_rate": att_rate, "q_avg": q_avg, "m_rate": m_rate}


def _compute_teacher_course_stats(
    course_id: int,
    student_ids: set[int],
    start_date: date | None,
    end_date: date | None,
    absent_records: dict[tuple[int, int, date], str],  # flat: (ci_id, student_id, date) -> status
    quizzes: list[dict],
    survey_items: list[dict],
    form_items: list[dict],
    flight_items: list[dict],
    materials_count: int,
    course_name: str,
    ci_list: list[int],
    teacher_name: str = "",
    color: str = "",
    student_completed: dict[int, int] | None = None,
    lesson_completion_rate: float = 0.0,
) -> TeacherCourseStats:
    # Build a global absent set across ALL courses for each student
    # Key: (student_user_id, date) -> absent for any course
    global_absent = set()
    for (ci_id, sid, d), status in absent_records.items():
        if status != "present":
            global_absent.add((sid, d))

    att_rate = _course_attendance_rate_global(
        student_ids,
        start_date or date.today(),
        end_date or date.today(),
        global_absent,
        ci_list,
    )

    completed_quizzes = [q for q in quizzes if q.get("score") is not None and (q.get("total") or 0) > 0]
    q_avg = round(sum((q.get("score") or 0) / q.get("total", 1) * 100 for q in completed_quizzes) / max(1, len(completed_quizzes)), 1) if completed_quizzes else 0.0

    survey_completed = [s for s in survey_items if s.get("score") is not None and (s.get("total") or 0) > 0]
    survey_avg = round(sum((s.get("score") or 0) / s.get("total", 1) * 100 for s in survey_completed) / max(1, len(survey_completed)), 1) if survey_completed else 0.0

    form_completed = [f for f in form_items if f.get("score") is not None and (f.get("total") or 0) > 0]
    form_avg = round(sum((f.get("score") or 0) / f.get("total", 1) * 100 for f in form_completed) / max(1, len(form_completed)), 1) if form_completed else 0.0

    flight_completed = [f for f in flight_items if f.get("score") is not None]
    flight_avg = round(sum((f.get("score") or 0) / f.get("total", 1) * 100 for f in flight_completed) / max(1, len(flight_completed)), 1) if flight_completed else 0.0

    # Course material completion = average of each student's completed/total files.
    student_completed = student_completed or {}
    if materials_count and student_ids:
        per_student_rates = [
            min(100.0, round(student_completed.get(sid, 0) / materials_count * 100, 1))
            for sid in student_ids
        ]
        m_rate = round(sum(per_student_rates) / len(per_student_rates), 1) if per_student_rates else 0.0
    else:
        m_rate = 0.0

    at_risk = 0
    for sid in student_ids:
        course_quizzes = [q for q in quizzes if q.get("student_id") == sid]
        stats = _compute_per_student_stats_global(
            sid, global_absent, start_date, end_date, course_quizzes, materials_count, ci_list,
            completed_count=student_completed.get(sid, 0),
        )
        if stats.get("q_avg", 0) < 60 or stats.get("m_rate", 0) < 60:
            at_risk += 1

    return TeacherCourseStats(
        course_id=course_id,
        course_name=course_name,
        teacher_name=teacher_name,
        color=color,
        student_count=len(student_ids),
        average_attendance_rate=att_rate,
        average_quiz_score=q_avg,
        average_survey_score=survey_avg,
        average_form_score=form_avg,
        average_flight_score=flight_avg,
        average_assessment_score=round(sum(v for v in [q_avg, survey_avg, form_avg, flight_avg] if v != 0) / max(1, sum(1 for v in [q_avg, survey_avg, form_avg, flight_avg] if v != 0)), 1),
        average_materials_completion_rate=m_rate,
        low_performers=at_risk,
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat() if end_date else None,
        lesson_completion_rate=lesson_completion_rate,
    )


def _course_attendance_rate_global(
    student_ids: set[int],
    start_date: date,
    end_date: date,
    global_absent: set[tuple[int, date]],  # (student_user_id, date)
    ci_list: list[int],
) -> float:
    if not student_ids or not start_date or not end_date or start_date > end_date:
        return 0.0

    rates = []
    for sid in student_ids:
        rates.append(_attendance_rate_single_global(start_date, end_date, sid, global_absent, ci_list))
    return round(sum(rates) / len(rates), 1)


def _attendance_rate_single_global(
    start_date: date,
    end_date: date,
    student_id: int,
    global_absent: set[tuple[int, date]],
    ci_list: list[int],
    holidays: frozenset[str] | None = None,
) -> float:
    if holidays is None:
        holidays = KNOWN_HOLIDAYS

    today = date.today()
    end_date = min(end_date, today)
    if start_date > end_date:
        return 0.0

    total_days = 0
    absent_days = 0
    for d in _all_business_days(start_date, end_date, holidays, ci_list):
        if (student_id, d) in global_absent:
            absent_days += 1
        total_days += 1

    return round((total_days - absent_days) / max(1, total_days) * 100, 1)


def _all_business_days(start_date: date, end_date: date, holidays: frozenset, ci_list: list[int]) -> list[date]:
    """Generate business days across ALL course date ranges, capped to today."""
    days = set()
    current = start_date
    while current <= end_date:
        iso = current.isoformat()
        if iso not in holidays:
            day_of_week = current.weekday()
            if day_of_week < 5:  # Mon-Fri
                days.add(current)
        current += timedelta(days=1)
    return sorted(days)


def _materials_completion_by_ci(db, ci_ids, student_ids):
    """Real lesson-material completion, joining each course instance's material
    files to per-user reading progress. A file counts as completed for a user when
    total_pages > 0 and pages_read >= total_pages.

    Returns (total_by_ci, completed_by_ci_student):
      total_by_ci[ci_id]              -> number of material files in the course
      completed_by_ci_student[(ci,u)] -> files that user u completed in course ci
    """
    total_by_ci: dict[int, int] = {}
    completed_by_ci_student: dict[tuple[int, int], int] = {}
    ci_ids = list(ci_ids or [])
    if not ci_ids:
        return total_by_ci, completed_by_ci_student

    for ci_id, cnt in (
        db.query(
            CourseSelectionMaterialFile.course_instance_id,
            func.count(CourseSelectionMaterialFile.id),
        )
        .filter(CourseSelectionMaterialFile.course_instance_id.in_(ci_ids))
        .group_by(CourseSelectionMaterialFile.course_instance_id)
        .all()
    ):
        total_by_ci[ci_id] = cnt

    student_ids = list(student_ids or [])
    if student_ids:
        rows = (
            db.query(
                CourseSelectionMaterialFile.course_instance_id,
                CourseSelectionMaterialUserProgress.user_id,
                func.count(CourseSelectionMaterialUserProgress.id),
            )
            .join(
                CourseSelectionMaterialUserProgress,
                CourseSelectionMaterialUserProgress.file_id == CourseSelectionMaterialFile.id,
            )
            .filter(
                CourseSelectionMaterialFile.course_instance_id.in_(ci_ids),
                CourseSelectionMaterialUserProgress.user_id.in_(student_ids),
                CourseSelectionMaterialUserProgress.total_pages > 0,
                CourseSelectionMaterialUserProgress.pages_read
                >= CourseSelectionMaterialUserProgress.total_pages,
            )
            .group_by(
                CourseSelectionMaterialFile.course_instance_id,
                CourseSelectionMaterialUserProgress.user_id,
            )
            .all()
        )
        for ci_id, sid, cnt in rows:
            completed_by_ci_student[(ci_id, sid)] = cnt

    return total_by_ci, completed_by_ci_student


def _compute_per_student_stats_global(
    student_id: int,
    global_absent: set[tuple[int, date]],
    start_date: date | None,
    end_date: date | None,
    quizzes: list[dict],
    materials_count: int,
    ci_list: list[int],
    completed_count: int = 0,
) -> dict:
    att_rate = _attendance_rate_single_global(
        start_date or date.today(),
        end_date or date.today(),
        student_id,
        global_absent,
        ci_list,
    )
    qz = [q for q in quizzes if q.get("student_id") == student_id and q.get("score") is not None]
    q_avg = round(sum((q.get("score") or 0) / q.get("total", 1) * 100 for q in qz) / max(1, len(qz)), 1) if qz else 0.0
    m_rate = round(completed_count / materials_count * 100, 1) if materials_count else 0.0
    return {"att_rate": att_rate, "q_avg": q_avg, "m_rate": m_rate}


def _get_total_lessons_by_ci(db: Session, ci_ids: list[int]) -> dict[int, int]:
    """Return total number of lessons per course instance."""
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreation,
        CourseSelectionInfoLessonCreationLesson,
    )
    if not ci_ids:
        return {}
    return {
        r.ci_id: r.cnt
        for r in db.query(
            CourseSelectionInfoLessonCreation.course_instance_id.label("ci_id"),
            func.count(CourseSelectionInfoLessonCreationLesson.id).label("cnt"),
        )
        .join(
            CourseSelectionInfoLessonCreationLesson,
            CourseSelectionInfoLessonCreationLesson.course_selection_info_lesson_creation_id
            == CourseSelectionInfoLessonCreation.id,
        )
        .filter(CourseSelectionInfoLessonCreation.course_instance_id.in_(ci_ids))
        .group_by(CourseSelectionInfoLessonCreation.course_instance_id)
        .all()
    }


def _get_completed_lessons_by_ci(
    db: Session, ci_ids: list[int], student_ids: set[int]
) -> tuple[dict[int, set[int]], dict[tuple[int, int], set[int]]]:
    """Return completed lesson IDs per CI and per student per CI, where content_type='lesson'."""
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreation,
        CourseSelectionInfoLessonCreationLesson,
    )

    completed_by_ci: dict[int, set[int]] = {}
    completed_by_ci_student: dict[tuple[int, int], set[int]] = {}
    if not ci_ids or not student_ids:
        return completed_by_ci, completed_by_ci_student

    rows = (
        db.query(
            CourseSelectionInfoLessonCreation.course_instance_id,
            CourseSelectionLessonCompletion.lesson_id,
            CourseSelectionLessonCompletion.student_id,
        )
        .join(
            CourseSelectionInfoLessonCreationLesson,
            CourseSelectionInfoLessonCreationLesson.id
            == CourseSelectionLessonCompletion.lesson_id,
        )
        .join(
            CourseSelectionInfoLessonCreation,
            CourseSelectionInfoLessonCreation.id
            == CourseSelectionInfoLessonCreationLesson.course_selection_info_lesson_creation_id,
        )
        .filter(
            CourseSelectionInfoLessonCreation.course_instance_id.in_(ci_ids),
            CourseSelectionLessonCompletion.student_id.in_(list(student_ids)),
            CourseSelectionLessonCompletion.content_type == "lesson",
        )
        .distinct()
        .all()
    )
    for ci_id, lesson_id, student_id in rows:
        completed_by_ci.setdefault(ci_id, set()).add(lesson_id)
        completed_by_ci_student.setdefault(
            (ci_id, student_id), set()
        ).add(lesson_id)

    return completed_by_ci, completed_by_ci_student


# ===================================================================
# Student view
# ===================================================================


@router.get("/student/overview", response_model=SuccessResponse)
def get_student_overview(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_STUDENT)),
    current_user: "User" = Depends(get_current_user),
):
    student_user_id = current_user.id
    # Enrollment is the sole authoritative source for course membership.
    student_ci_ids = _get_student_course_instance_ids(db, student_user_id)

    if not student_ci_ids:
        return ok({"overall": 0, "attendance": 0, "quizzes": 0, "materials": 0, "courses": []})

    # Only progress courses matching those CI IDs
    student_courses =  (
        db.query(CourseEnrollment.course_instance_id.label("course_instance_id"), CourseMaster.title.label("title"))
            .join(CourseInstance, CourseEnrollment.course_instance_id == CourseInstance.id)
            .join(CourseMaster, CourseInstance.master_id == CourseMaster.id)
            .join(Profile, CourseEnrollment.student_id == Profile.id)
            .filter(Profile.user_id == student_user_id)
            .distinct()
            .all()
    )

    if not student_courses:
        return ok({"overall": 0, "attendance": 0, "quizzes": 0, "materials": 0, "courses": []})

    ci_ids = {pc.course_instance_id for pc in student_courses if pc.course_instance_id}
    absent_records = _get_all_absent_records(db, ci_ids, {student_user_id})#_get_all_absent_records(db, ci_ids, {student_user_id})
    date_ranges = _make_date_ranges(db, ci_ids)

    #title_map = _build_title_map(db, ci_ids) if ci_ids else {}

    ci_list = list(ci_ids) if ci_ids else []
    # Get student profile ID once
    student_row = db.query(Profile.id).filter(Profile.user_id == student_user_id).first()
    stid_ = student_row[0] if student_row else None

    quizzes_by_ci: dict[int, list[dict]] = {}
    if stid_ and ci_list:
        quiz_rows = db.execute(
            select(
                CourseSelectionLessonRelease.course_instance_id.label("ci_id"),
                CourseSelectionLessonRelease.content_id.label("quiz_id"),
                QuizAttempt.score,
                QuizAttempt.max_score.label("total"),
            )
            .select_from(CourseSelectionLessonRelease)
            # Per-student release: match the enrolment on the targeted student too.
            .join(CourseEnrollment, and_(
                CourseEnrollment.course_instance_id == CourseSelectionLessonRelease.course_instance_id,
                CourseEnrollment.student_id == CourseSelectionLessonRelease.student_id))
            .where(
                CourseEnrollment.student_id == stid_,
                CourseSelectionLessonRelease.course_instance_id.in_(ci_list),
                CourseSelectionLessonRelease.content_type == "quiz",
            )
            .outerjoin(QuizAttempt, and_(
                QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id,
                QuizAttempt.student_id == stid_,
            ))
        ).all()
        seen = set()
        for r in quiz_rows:
            key = (r.ci_id, r.quiz_id)
            if key in seen:
                continue
            seen.add(key)
            quizzes_by_ci.setdefault(r.ci_id, []).append({
                "id": r.quiz_id,
                "ci_id": r.ci_id,
                "score": r.score,
                "total": r.total,
                "completed": r.score is not None,
            })
    # Real lesson-material completion for this student (replaces the never-written
    # ProgressMaterialRecord table).
    mat_total_by_ci, mat_completed_by_ci_student = _materials_completion_by_ci(
        db, ci_list, {student_user_id}
    )

    flight_items = _get_flight_packages_for_assessment(db, ci_list, "", student_user_id)
    form_items = _get_forms_for_assessment(db, ci_list, "", student_user_id)
    survey_items = _get_surveys_for_assessment(db, ci_list, "", student_user_id)

    # Lesson completion data for overall_progress
    ci_ids_for_lessons = [
        s.course_instance_id for s in student_courses if s.course_instance_id
    ]
    total_lessons_by_ci = _get_total_lessons_by_ci(db, ci_ids_for_lessons)
    (
        _completed_lessons_by_ci,
        _completed_lessons_by_ci_student,
    ) = _get_completed_lessons_by_ci(db, ci_ids_for_lessons, {stid_} if stid_ else set())

    # Build global absent set for this student only: (user_id, date)
    global_absent = set()
    for (ci_id, sid, d), status in absent_records.items():
        if status != "present":
            global_absent.add((sid, d))

    # Per-student stats: only for the current logged-in student
    all_starts = [dr[0] for dr in date_ranges.values() if dr[0] is not None]
    all_ends = [dr[1] for dr in date_ranges.values() if dr[1] is not None]
    global_start = min(all_starts, default=date.today())
    global_end = min(max(all_ends, default=date.today()), date.today())

    att_rate = _attendance_rate_single_global(
        global_start, global_end, student_user_id, global_absent, ci_list
    )

    absent_count = 0
    late_count = 0
    excused_count = 0
    simulation_count = 0
    flying_count = 0
    for (cid, sid_check, d), status in absent_records.items():
        if sid_check == student_user_id:
            if status == "absent": absent_count += 1
            elif status == "late": late_count += 1
            elif status == "excused": excused_count += 1
            elif status == "simulation": simulation_count += 1
            elif status == "flying": flying_count += 1

    present_count = 0
    for pc in student_courses:
        ci_id = pc.course_instance_id
        dr = date_ranges.get(ci_id)
        if not dr or not dr[0] or not dr[1]:
            continue
        cs, ce = dr[0], min(dr[1], date.today())
        if cs > ce:
            continue
        current = cs
        while current <= ce:
            iso = current.isoformat()
            if iso not in KNOWN_HOLIDAYS and current.weekday() < 5:
                if (student_user_id, current) not in global_absent:
                    present_count += 1
            current += timedelta(days=1)

    per_student_stats = {
        "attendance_rate": round(att_rate, 1),
        "present_count": present_count,
        "absent_count": absent_count,
        "excused_count": excused_count,
        "late_count": late_count,
        "simulation_count": simulation_count,
        "flying_count": flying_count,
    }

    all_stats = []
    for pc in student_courses:
        ci_id = pc.course_instance_id
        #name = title_map.get(ci_id, pc.name) if ci_id else pc.course.
        name = pc.title

        completed_quizzes = [q for q in quizzes_by_ci.get(ci_id, []) if q["completed"] and (q["total"] or 0) > 0]
        quiz_average = round(
            sum((q["score"] or 0) / q["total"] * 100 for q in completed_quizzes) / max(1, len(completed_quizzes)), 1
        ) if completed_quizzes else 0.0

        survey_completed = [s for s in survey_items if s["course_id"] == ci_id and s.get("score") is not None and (s.get("total") or 0) > 0]
        survey_average = round(
            sum((s["score"] or 0) / s.get("total", 1) * 100 for s in survey_completed) / max(1, len(survey_completed)), 1
        ) if survey_completed else 0.0

        form_completed = [f for f in form_items if f["course_id"] == ci_id and f.get("score") is not None and (f.get("total") or 0) > 0]
        form_average = round(
            sum((f["score"] or 0) / f.get("total", 1) * 100 for f in form_completed) / max(1, len(form_completed)), 1
        ) if form_completed else 0.0

        flight_completed = [f for f in flight_items if f["course_id"] == ci_id and f.get("score") is not None]
        flight_average = round(
            sum((f["score"] or 0) / f.get("total", 1) * 100 for f in flight_completed) / max(1, len(flight_completed)), 1
        ) if flight_completed else 0.0

        total_materials = mat_total_by_ci.get(ci_id, 0)
        completed_materials = mat_completed_by_ci_student.get((ci_id, student_user_id), 0)
        materials_completion_rate = (
            round(completed_materials / total_materials * 100, 1) if total_materials else 0.0
        )

        total_lessons = total_lessons_by_ci.get(ci_id, 0)
        completed_lessons = len(
            _completed_lessons_by_ci_student.get((ci_id, stid_), set())
        )
        lesson_completion_rate = (
            round(completed_lessons / total_lessons * 100, 1) if total_lessons else 0.0
        )

        overall_progress = lesson_completion_rate

        assessment_values = [v for v in [quiz_average, survey_average, form_average, flight_average] if v != 0]
        assessment_average = round(sum(assessment_values) / len(assessment_values), 1) if assessment_values else 0.0

        all_stats.append(CourseStats(
            course_id=pc.course_instance_id,
            course_name=name,
            teacher_name='',#pc.teacher_name,
            color='',#pc.color,
            attendance_rate=att_rate,
            quiz_average=quiz_average,
            survey_average=survey_average,
            form_average=form_average,
            flight_average=flight_average,
            assessment_average=assessment_average,
            materials_completed=completed_materials,
            materials_total=total_materials,
            materials_completion_rate=materials_completion_rate,
            overall_progress=overall_progress,
            lesson_completion_rate=lesson_completion_rate,
        ))

    if not all_stats:
        return ok({"overall": 0, "attendance": 0, "overall_quiz_avg": 0, "overall_survey_avg": 0, "overall_form_avg": 0, "overall_flight_avg": 0, "overall_assessment_avg": 0, "materials": 0, "courses": []})

    return ok({
        "overall": round(sum(s.overall_progress for s in all_stats) / len(all_stats), 1),
        "attendance": round(sum(s.attendance_rate for s in all_stats) / len(all_stats), 1),
        "overall_quiz_avg": round(sum(s.quiz_average for s in all_stats) / len(all_stats), 1),
        "overall_survey_avg": round(sum(s.survey_average for s in all_stats) / len(all_stats), 1),
        "overall_form_avg": round(sum(s.form_average for s in all_stats) / len(all_stats), 1),
        "overall_flight_avg": round(sum(s.flight_average for s in all_stats) / len(all_stats), 1),
        "overall_assessment_avg": round(sum(s.assessment_average for s in all_stats) / len(all_stats), 1),
        "materials": round(sum(s.materials_completion_rate for s in all_stats) / len(all_stats), 1),
        "courses": all_stats,
        "perStudentStats": per_student_stats,
    })


@router.get("/student/courses", response_model=SuccessResponse[list[CourseStats]])
def get_student_courses(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_STUDENT)),
):
    courses = db.query(ProgressCourse).order_by(ProgressCourse.id).all()
    ci_ids = {pc.course_id for pc in courses if pc.course_id}
    absent_records = _get_all_absent_records(db, ci_ids, set())
    date_ranges = _make_date_ranges(db, ci_ids)
    student_ids_per_ci = _get_student_ids_per_course(db, ci_ids)
    title_map = _build_title_map(db, ci_ids) if ci_ids else {}

    ci_list = list(ci_ids) if ci_ids else []
    quizzes_by_ci: dict[int, list[ProgressQuizRecord]] = {}
    materials_by_ci: dict[int, list[ProgressMaterialRecord]] = {}
    for q in db.query(ProgressQuizRecord).filter(ProgressQuizRecord.course_id.in_(ci_list)).all():
        quizzes_by_ci.setdefault(q.course_id, []).append(q)
    for m in db.query(ProgressMaterialRecord).filter(ProgressMaterialRecord.course_id.in_(ci_list)).all():
        materials_by_ci.setdefault(m.course_id, []).append(m)

    result = []
    for pc in courses:
        ci_id = pc.course_id
        start_date, end_date = date_ranges.get(ci_id, (None, None))
        sids = student_ids_per_ci.get(ci_id, set())
        qz = quizzes_by_ci.get(ci_id, [])
        mt = materials_by_ci.get(ci_id, [])
        absents = absent_records.get(ci_id, {})
        name = title_map.get(ci_id, pc.name) if ci_id else pc.name
        result.append(_compute_course_stats(pc, sids, start_date, end_date, absents, qz, mt, name))
    return ok(result)


@router.get("/student/attendance", response_model=SuccessResponse)
def get_student_attendance(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_STUDENT)),
    current_user: "User" = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    course_id: int | None = Query(None, ge=1),
    status: str | None = Query(None),
):
    # student_row = db.query(Student.id).filter(Student.user_id == current_user.id).first()
    # if not student_row:
    #     return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))
    # internal_student_id = student_row[0] if student_row else None

    # if not internal_student_id:
    #     return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    # # Discover enrolled courses via enrollments table so 100% attendance students appear.
    # enrollment_stmt = (
    #     db.query(
    #         EnrollmentModel.section_id,
    #         SectionModel.course_id,
    #     )
    #     .select_from(EnrollmentModel)
    #     .join(SectionModel, EnrollmentModel.section_id == SectionModel.id)
    #     .filter(
    #         EnrollmentModel.student_id == internal_student_id,
    #         EnrollmentModel.status == EnrollmentStatus.ENROLLED,
    #     )
    # )

    # if course_id:
    #     enrollment_stmt = enrollment_stmt.filter(SectionModel.course_id == course_id)

    # enrollment_rows = enrollment_stmt.all()

    # if not enrollment_rows:
    #     return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    # Gather unique course_instance IDs and section IDs from enrollments
    # ci_enrolled_ids = {r.course_id for r in enrollment_rows}
    # section_ids = {r.section_id for r in enrollment_rows}
    
    internal_student_id = current_user.id
    ci_enrolled_ids = [course_id] if course_id else _get_student_course_instance_ids(db, current_user.id)

    # Fetch course date ranges for enrolled courses
    course_date_ranges: dict[int, dict[str, str | None]] = {}
    ci_meta: list[tuple[int, date, date]] = []
    for ci_id, start_raw, end_raw in db.query(
        CourseInstance.id, CourseInstance.start_date, CourseInstance.end_date
    ).filter(CourseInstance.id.in_(list(ci_enrolled_ids))).all():
        if start_raw and end_raw:
            course_date_ranges[ci_id] = {
                "start_date": start_raw.isoformat() if start_raw else None,
                "end_date": end_raw.isoformat() if end_raw else None,
            }
            ci_meta.append((ci_id, start_raw, end_raw))

    # Fetch display name
    student_map = _load_student_map(db, {current_user.id})
    student_name = student_map.get(current_user.id, "")

    # Fetch all absence records for this student (batched, matching _get_all_absent_records pattern)
    abs_by_ci_date: dict[tuple[int, str], str] = {}
    if ci_enrolled_ids:
        abs_records = (
            db.query(
                CourseInstance.id.label("ci_id"),
                AttendanceModel.date,
                AttendanceStatusModel.code,
            )
            .select_from(AttendanceModel)
            .join(AttendanceStatusModel, AttendanceModel.status_id == AttendanceStatusModel.id, isouter=True)
            .join(
                CourseInstance,
                and_(
                    AttendanceModel.date >= CourseInstance.start_date,
                    AttendanceModel.date <= CourseInstance.end_date,
                    CourseInstance.id.in_(list(ci_enrolled_ids)),
                ),
            )
            .where(
                AttendanceModel.student_id == internal_student_id,
            )
            .distinct()
            .all()
        )
        for rec in abs_records:
            abs_by_ci_date[(rec.ci_id, rec.date.isoformat())] = rec.code

    # Build attendance records using inverse logic: no absence record = present
    today = date.today()
    data_output: list[dict] = []
    ci_ids_in_result: set[int] = set()

    # for r in enrollment_rows:
    #     ci = r.course_id
    for ci in ci_enrolled_ids:
        cr = course_date_ranges.get(ci)
        if not cr or not cr.get("start_date") or not cr.get("end_date"):
            continue

        course_start = date.fromisoformat(cr["start_date"])
        course_end = min(date.fromisoformat(cr["end_date"]), today)
        if course_start > course_end:
            continue

        ci_ids_in_result.add(ci)

        # Generate attendance records for each business day in course range
        current = course_start
        while current <= course_end:
            iso = current.isoformat()
            if iso not in KNOWN_HOLIDAYS and current.weekday() < 5:  # Mon-Fri only
                abs_status = abs_by_ci_date.get((ci, iso))
                data_output.append({
                    "id": None,
                    "student_id": internal_student_id,
                    "date": iso,
                    "status": abs_status if abs_status else "present",
                    "student_name": student_name,
                    "course_id": ci,
                    "course_name": None,
                })
            current += timedelta(days=1)

    # Resolve course names (batched)
    course_names: dict[int, str] = {}
    if ci_ids_in_result:
        for ci_id in db.query(CourseInstance.id, CourseInstance.title).filter(
            CourseInstance.id.in_(list(ci_ids_in_result))
        ).all():
            course_names[ci_id] = ci_id[1]
    for d in data_output:
        d["course_name"] = course_names.get(d["course_id"], "")

    # Sort by date descending
    data_output.sort(key=lambda x: x["date"], reverse=True)

    # Aggregate stats computed BEFORE status filter
    agg_present = sum(1 for r in data_output if r["status"] == "present")
    agg_absent = sum(1 for r in data_output if r["status"] == "absent")
    agg_late = sum(1 for r in data_output if r["status"] == "late")
    agg_excused = sum(1 for r in data_output if r["status"] == "excused")
    agg_simulation = sum(1 for r in data_output if r["status"] == "simulation")
    agg_flying = sum(1 for r in data_output if r["status"] == "flying")
    agg_students = len(data_output)

    # Filter by status if specified
    if status:
        data_output = [r for r in data_output if r["status"] == status]

    return SuccessResponse(
        data={
            "records": data_output,
            "aggregatedStats": {
                "present": agg_present,
                "absent": agg_absent,
                "late": agg_late,
                "excused": agg_excused,
                "simulation": agg_simulation,
                "flying": agg_flying,
                "total": agg_students,
            },
        },
        meta=Meta(page=page, page_size=page_size, total=len(data_output), pages=1),
        extra={
            "courseDateRanges": course_date_ranges,
            "holidays": list(KNOWN_HOLIDAYS),
        },
    )


@router.get("/student/assessment", response_model=SuccessResponse)
def get_student_assessment(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_STUDENT)),
    current_user: "User" = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    course_id: int | None = Query(None, ge=1),
    status: str | None = Query(None),
):
    student_profile = db.query(Profile.id).filter(Profile.user_id == current_user.id).first()
    if not student_profile:
        return ok([], meta=Meta(page=page, page_size=page_size, total=0, pages=0))
    stid: int = student_profile[0]

    # Get student's enrolled course instance IDs
    student_course_ids = [
        ci[0] for ci in db.query(
            CourseEnrollment.course_instance_id
        ).filter(CourseEnrollment.student_id == stid).distinct().all()
    ]
    if course_id:
        student_course_ids = [cid for cid in student_course_ids if cid == course_id]

    helper_items = _get_quizzes_for_assessment(
        db, course_ids=student_course_ids,
        status_param=status or "",
        student_id=current_user.id,
    )
    flight_items = _get_flight_packages_for_assessment(
        db, course_ids=student_course_ids,
        status_param=status or "",
        student_id=current_user.id,
    )
    form_items = _get_forms_for_assessment(
        db, course_ids=student_course_ids,
        status_param=status or "",
        student_id=current_user.id,
    )
    survey_items = _get_surveys_for_assessment(
        db, course_ids=student_course_ids,
        status_param=status or "",
        student_id=current_user.id,
    )

    all_items = helper_items + flight_items + form_items + survey_items

    items = [{
        "id": i["id"],
        "course_id": i["course_id"],
        "title": i["title"],
        "assessment_type": i["assessment_type"],
        "score": i["score"],
        "total": i["total"],
        "date": i["date"] or i.get("released_at"),
        "status": i["status"],
    } for i in all_items]

    total = len(items)
    pages = max(1, math.ceil(total / page_size))
    items = items[(page - 1) * page_size : page * page_size]

    return ok(items, meta=Meta(page=page, page_size=page_size, total=total, pages=pages))


def _material_row(file, pages_read, total_pages, course_name, *, student_id=None, student_name=None):
    """One drill-down row for a lesson material file + a user's reading progress, in
    the shape the frontend adapters (toMaterialRecord / toStudentMaterialRecord) read.
    Reading progress maps to watched/total_duration so the UI's completed /
    in-progress / not-started derivation works."""
    completed = total_pages > 0 and pages_read >= total_pages
    row = {
        "id": str(file.id),
        "course_id": file.course_instance_id,
        "course_name": course_name,
        "title": file.filename,
        "material_type": (
            file.filename.rsplit(".", 1)[-1].lower()
            if "." in file.filename
            else (file.content_type or "")
        ),
        "completed": completed,
        "total_duration": total_pages,
        "watched_duration": pages_read,
        "date_added": file.created_at.isoformat() if file.created_at else None,
    }
    if student_id is not None:
        row["student_id"] = student_id
        row["student_name"] = student_name or ""
    return row


def _material_passes_filters(row, pages_read, completed, completion_state):
    is_completed = row["completed"]
    if completed is not None and is_completed != completed:
        return False
    if completion_state == "completed" and not is_completed:
        return False
    if completion_state == "in-progress" and not (pages_read > 0 and not is_completed):
        return False
    if completion_state == "not-started" and not (pages_read == 0 and not is_completed):
        return False
    return True


@router.get("/student/materials", response_model=SuccessResponse)
def get_student_materials(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_STUDENT)),
    current_user: "User" = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    course_id: int | None = Query(None, ge=1),
    completed: bool | None = Query(None),
    completion_state: str | None = Query(None),
):
    """The student's own lesson materials with real read status, built from
    CourseSelectionMaterialFile + this user's reading progress."""
    ci_ids = _get_student_course_instance_ids(db, current_user.id)
    if course_id:
        ci_ids = {course_id} & ci_ids
    if not ci_ids:
        return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    files = (
        db.query(CourseSelectionMaterialFile)
        .filter(CourseSelectionMaterialFile.course_instance_id.in_(ci_ids))
        .order_by(CourseSelectionMaterialFile.created_at.desc())
        .all()
    )
    file_ids = [f.id for f in files]
    progress_map: dict = {}
    if file_ids:
        for p in (
            db.query(CourseSelectionMaterialUserProgress)
            .filter(
                CourseSelectionMaterialUserProgress.user_id == current_user.id,
                CourseSelectionMaterialUserProgress.file_id.in_(file_ids),
            )
            .all()
        ):
            progress_map[p.file_id] = (p.pages_read, p.total_pages)

    title_map = _build_title_map(db, ci_ids)
    rows = []
    for f in files:
        pr, tp = progress_map.get(f.id, (0, 0))
        row = _material_row(f, pr, tp, title_map.get(f.course_instance_id, ""))
        if _material_passes_filters(row, pr, completed, completion_state):
            rows.append(row)

    total = len(rows)
    pages = max(1, math.ceil(total / page_size))
    start = (page - 1) * page_size
    return SuccessResponse(
        data=rows[start:start + page_size],
        meta=Meta(page=page, page_size=page_size, total=total, pages=pages),
    )


@router.get("/student/lessons", response_model=SuccessResponse)
def get_student_lessons(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_STUDENT)),
    current_user: "User" = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=200),
    course_id: int | None = Query(None, ge=1),
    status: str | None = Query(None),
):
    """The student's lessons with completion status. A lesson is "complete" once a
    teacher marks it complete (a ``content_type='lesson'`` completion row); the row
    records who marked it (``completed_by_id``) and when (``completed_at``)."""
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreation,
        CourseSelectionInfoLessonCreationLesson,
    )

    ci_ids = _get_student_course_instance_ids(db, current_user.id)
    if course_id:
        ci_ids = {course_id} & ci_ids
    if not ci_ids:
        return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    ci_list = list(ci_ids)

    # Lesson completions FK to profiles.id, so resolve the student's profile id.
    student_row = db.query(Profile.id).filter(Profile.user_id == current_user.id).first()
    stid_ = student_row[0] if student_row else None

    # All lessons across the student's course instances.
    lesson_rows = (
        db.query(
            CourseSelectionInfoLessonCreation.course_instance_id.label("ci_id"),
            CourseSelectionInfoLessonCreationLesson.id.label("lesson_id"),
            CourseSelectionInfoLessonCreationLesson.lesson_number,
            CourseSelectionInfoLessonCreationLesson.lesson_title,
        )
        .join(
            CourseSelectionInfoLessonCreationLesson,
            CourseSelectionInfoLessonCreationLesson.course_selection_info_lesson_creation_id
            == CourseSelectionInfoLessonCreation.id,
        )
        .filter(CourseSelectionInfoLessonCreation.course_instance_id.in_(ci_list))
        .order_by(
            CourseSelectionInfoLessonCreation.course_instance_id,
            CourseSelectionInfoLessonCreationLesson.order_index,
        )
        .all()
    )

    # This student's lesson completions: lesson_id -> (completed_at, completed_by_id)
    completion_map: dict[int, tuple] = {}
    if stid_:
        for lid, cat, cby in (
            db.query(
                CourseSelectionLessonCompletion.lesson_id,
                CourseSelectionLessonCompletion.completed_at,
                CourseSelectionLessonCompletion.completed_by_id,
            )
            .filter(
                CourseSelectionLessonCompletion.course_instance_id.in_(ci_list),
                CourseSelectionLessonCompletion.student_id == stid_,
                CourseSelectionLessonCompletion.content_type == "lesson",
            )
            .all()
        ):
            completion_map[lid] = (cat, cby)

    # Resolve the "completed by" teacher names.
    completer_ids = {v[1] for v in completion_map.values() if v[1]}
    completer_map: dict[int, str] = {}
    if completer_ids:
        for p in db.query(Profile).filter(Profile.id.in_(list(completer_ids))).all():
            completer_map[p.id] = f"{p.first_name} {p.middle_name or ''} {p.last_name or ''}".strip()

    title_map = _build_title_map(db, ci_ids)

    rows = []
    for r in lesson_rows:
        comp = completion_map.get(r.lesson_id)
        is_completed = comp is not None
        if status == "complete" and not is_completed:
            continue
        if status == "incomplete" and is_completed:
            continue
        rows.append({
            "course_id": r.ci_id,
            "course_name": title_map.get(r.ci_id, f"Course {r.ci_id}"),
            "lesson_id": r.lesson_id,
            "lesson_number": r.lesson_number,
            "lesson_title": r.lesson_title
            or (f"Lesson {r.lesson_number}" if r.lesson_number else f"Lesson {r.lesson_id}"),
            "completed": is_completed,
            "completed_by": completer_map.get(comp[1]) if comp else None,
            "completed_at": comp[0].isoformat() if comp and comp[0] else None,
        })

    total = len(rows)
    pages = max(1, math.ceil(total / page_size))
    start = (page - 1) * page_size
    return SuccessResponse(
        data=rows[start:start + page_size],
        meta=Meta(page=page, page_size=page_size, total=total, pages=pages),
    )


# ===================================================================
# Observer view (teacher/admin)
# ===================================================================


@router.get("/observer/overview", response_model=SuccessResponse)
def get_observer_overview(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_TEACHER)),
    current_user: "User" = Depends(get_current_user),
):
    teacher_course_ids = _get_teacher_course_ids(db, current_user.id)
    if not teacher_course_ids:
        return ok({
            "total_courses": 0, "total_students": 0,
            "overall_attendance": 0, "overall_quiz_avg": 0,
            "overall_materials_completion": 0, "at_risk_students": 0, "courses": [],
        })
    
    ci_ids = set(teacher_course_ids)
    courses = (
        db.query(CourseInstance)
        .options(joinedload(CourseInstance.master).load_only(CourseMaster.title))
        .filter(CourseInstance.id.in_(list(ci_ids)))
        .all()
    )
    if not courses:
        return ok({
            "total_courses": 0, "total_students": 0,
            "overall_attendance": 0, "overall_quiz_avg": 0,
            "overall_materials_completion": 0, "at_risk_students": 0, "courses": [],
        })

    absent_records = _get_all_absent_records(db, ci_ids, set())
    date_ranges = _make_date_ranges(db, ci_ids)
    student_ids_per_ci = _get_student_ids_per_course(db, ci_ids)
    title_map = _build_title_map(db, ci_ids) if ci_ids else {}

    ci_list = list(ci_ids)
    
    # Quiz data: released quizzes + attempts for enrolled students
    quizzes_by_ci: dict[int, list[dict]] = {}
    if ci_list:
        quiz_rows = (
            db.query(
                CourseSelectionLessonRelease.course_instance_id.label("ci_id"),
                CourseSelectionLessonRelease.content_id.label("quiz_id"),
                QuizAttempt.score,
                QuizAttempt.max_score.label("total"),
                Profile.user_id.label("student_id"),
            )
            .select_from(CourseSelectionLessonRelease)
            # Per-student release: match the enrolment on the targeted student too.
            .join(CourseEnrollment, and_(
                CourseEnrollment.course_instance_id == CourseSelectionLessonRelease.course_instance_id,
                CourseEnrollment.student_id == CourseSelectionLessonRelease.student_id))
            .join(Profile, Profile.id == CourseEnrollment.student_id)
            .outerjoin(QuizAttempt, and_(
                QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id,
                QuizAttempt.student_id == Profile.user_id,
            ))
            .filter(
                CourseSelectionLessonRelease.course_instance_id.in_(ci_list),
                CourseSelectionLessonRelease.content_type == "quiz",
            )
        ).all()
        
        for r in quiz_rows:
            if r.score is not None:  # only include completed quizzes
                quizzes_by_ci.setdefault(r.ci_id, []).append({
                    "id": r.quiz_id,
                    "ci_id": r.ci_id,
                    "score": r.score,
                    "total": r.total,
                    "completed": True,
                    "student_id": r.student_id,
                })
    
    # Materials: total files per course instance + each student's completed count,
    # joined to the real per-user reading progress (UUID file_id resolves the old
    # "can't join LibraryMaterialUserProgress" limitation).
    _all_sids_for_mat: set[int] = set()
    for _s in student_ids_per_ci.values():
        _all_sids_for_mat |= _s
    materials_by_ci, mat_completed_by_ci_student = _materials_completion_by_ci(
        db, ci_list, _all_sids_for_mat
    )

    # Lesson completion data for overall_progress (lesson completions FK to profiles.id)
    user_to_profile = (
        {p.user_id: p.id for p in db.query(Profile).filter(Profile.user_id.in_(list(_all_sids_for_mat))).all()}
        if _all_sids_for_mat
        else {}
    )
    _all_profiles_for_lesson: set[int] = set(user_to_profile.values())
    total_lessons_by_ci = _get_total_lessons_by_ci(db, ci_list)
    _completed_lessons_by_ci, _completed_lessons_by_ci_student = _get_completed_lessons_by_ci(
        db, ci_list, _all_profiles_for_lesson
    )

    all_student_ids: set[int] = set()
    course_stats = []

    flight_items = _get_flight_packages_for_assessment(db, teacher_course_ids, "", None)
    form_items = _get_forms_for_assessment(db, teacher_course_ids, "", None)
    survey_items = _get_surveys_for_assessment(db, teacher_course_ids, "", None)

    # Get teacher name once
    teacher_profile = db.query(Profile).filter(
        Profile.user_id == current_user.id
    ).first()
    teacher_name = f"{teacher_profile.first_name} {teacher_profile.middle_name or ''} {teacher_profile.last_name or ''}".strip() if teacher_profile else ""

    for ci in courses:
        ci_id = ci.id
        start_date, end_date = date_ranges.get(ci_id, (None, None))
        sids = student_ids_per_ci.get(ci_id, set())
        all_student_ids |= sids
        qz = quizzes_by_ci.get(ci_id, [])
        s_items = [s for s in survey_items if s["course_id"] == ci_id]
        f_items = [f for f in form_items if f["course_id"] == ci_id]
        fl_items = [fl for fl in flight_items if fl["course_id"] == ci_id]
        mt_count = materials_by_ci.get(ci_id, 0)
        name = title_map.get(ci_id, ci.title) if ci_id else ci.title
        student_completed = {sid: mat_completed_by_ci_student.get((ci_id, sid), 0) for sid in sids}
        t_lessons = total_lessons_by_ci.get(ci_id, 0)
        per_student_rates = [
            len(_completed_lessons_by_ci_student.get((ci_id, user_to_profile.get(sid)), set())) / t_lessons * 100 if t_lessons else 0.0
            for sid in sids
        ]
        lcr = round(sum(per_student_rates) / len(per_student_rates), 1) if per_student_rates else 0.0
        course_stats.append(_compute_teacher_course_stats(
            ci_id, sids, start_date, end_date, absent_records,
            qz, s_items, f_items, fl_items, mt_count, name, ci_list,
            teacher_name=teacher_name, color="", student_completed=student_completed,
            lesson_completion_rate=lcr,
        ))

    return ok({
        "total_courses": len(course_stats),
        "total_students": len(all_student_ids),
        "overall_attendance": round(sum(cs.average_attendance_rate for cs in course_stats) / max(1, len(course_stats)), 1),
        "overall_quiz_avg": round(sum(cs.average_quiz_score for cs in course_stats) / max(1, len(course_stats)), 1),
        "overall_survey_score": round(sum(cs.average_survey_score for cs in course_stats) / max(1, len(course_stats)), 1),
        "overall_form_score": round(sum(cs.average_form_score for cs in course_stats) / max(1, len(course_stats)), 1),
        "overall_flight_score": round(sum(cs.average_flight_score for cs in course_stats) / max(1, len(course_stats)), 1),
        "overall_materials_completion": round(sum(cs.average_materials_completion_rate for cs in course_stats) / max(1, len(course_stats)), 1),
        "overall_assessment_avg": round(sum((cs.average_quiz_score + cs.average_survey_score + cs.average_form_score + cs.average_flight_score) / 4 for cs in course_stats) / max(1, len(course_stats)), 1),
        "overall_lesson_completion": round(sum(cs.lesson_completion_rate for cs in course_stats) / max(1, len(course_stats)), 1),
        "at_risk_students": sum(cs.low_performers for cs in course_stats),
        "courses": course_stats,
    })


@router.get("/observer/lessons", response_model=SuccessResponse)
def get_observer_lessons(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_TEACHER)),
    current_user: "User" = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=200),
    course_id: int | None = Query(None, ge=1),
    status: str | None = Query(None),
):
    """Teacher/observer view of lessons across their courses. A lesson counts as
    "complete" only when EVERY enrolled student has it marked complete; if any
    enrolled student is still missing, the lesson is "incomplete"."""
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreation,
        CourseSelectionInfoLessonCreationLesson,
    )

    teacher_ci_ids = set(_get_teacher_course_ids(db, current_user.id))
    if course_id:
        teacher_ci_ids = {course_id} & teacher_ci_ids
    if not teacher_ci_ids:
        return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    ci_list = list(teacher_ci_ids)

    # Enrolled students (profile ids) per course instance.
    enrolled_by_ci: dict[int, set[int]] = {}
    for ci_id, sid in (
        db.query(CourseEnrollment.course_instance_id, CourseEnrollment.student_id)
        .filter(CourseEnrollment.course_instance_id.in_(ci_list))
        .distinct()
        .all()
    ):
        enrolled_by_ci.setdefault(ci_id, set()).add(sid)

    # All lessons across those course instances.
    lesson_rows = (
        db.query(
            CourseSelectionInfoLessonCreation.course_instance_id.label("ci_id"),
            CourseSelectionInfoLessonCreationLesson.id.label("lesson_id"),
            CourseSelectionInfoLessonCreationLesson.lesson_number,
            CourseSelectionInfoLessonCreationLesson.lesson_title,
        )
        .join(
            CourseSelectionInfoLessonCreationLesson,
            CourseSelectionInfoLessonCreationLesson.course_selection_info_lesson_creation_id
            == CourseSelectionInfoLessonCreation.id,
        )
        .filter(CourseSelectionInfoLessonCreation.course_instance_id.in_(ci_list))
        .order_by(
            CourseSelectionInfoLessonCreation.course_instance_id,
            CourseSelectionInfoLessonCreationLesson.order_index,
        )
        .all()
    )

    # Which students (profile ids) have completed each lesson.
    completed_by_lesson: dict[int, set[int]] = {}
    for lid, sid in (
        db.query(
            CourseSelectionLessonCompletion.lesson_id,
            CourseSelectionLessonCompletion.student_id,
        )
        .filter(
            CourseSelectionLessonCompletion.course_instance_id.in_(ci_list),
            CourseSelectionLessonCompletion.content_type == "lesson",
        )
        .distinct()
        .all()
    ):
        completed_by_lesson.setdefault(lid, set()).add(sid)

    title_map = _build_title_map(db, teacher_ci_ids)

    rows = []
    for r in lesson_rows:
        enrolled = enrolled_by_ci.get(r.ci_id, set())
        completed_set = completed_by_lesson.get(r.lesson_id, set())
        students_completed = len(enrolled & completed_set)
        # Complete only when there is at least one enrolled student and ALL of them
        # have the lesson marked complete.
        is_completed = bool(enrolled) and enrolled.issubset(completed_set)
        if status == "complete" and not is_completed:
            continue
        if status == "incomplete" and is_completed:
            continue
        rows.append({
            "course_id": r.ci_id,
            "course_name": title_map.get(r.ci_id, f"Course {r.ci_id}"),
            "lesson_id": r.lesson_id,
            "lesson_number": r.lesson_number,
            "lesson_title": r.lesson_title
            or (f"Lesson {r.lesson_number}" if r.lesson_number else f"Lesson {r.lesson_id}"),
            "completed": is_completed,
            "students_total": len(enrolled),
            "students_completed": students_completed,
        })

    total = len(rows)
    pages = max(1, math.ceil(total / page_size))
    start = (page - 1) * page_size
    return SuccessResponse(
        data=rows[start:start + page_size],
        meta=Meta(page=page, page_size=page_size, total=total, pages=pages),
    )


@router.get("/observer/lesson-students", response_model=SuccessResponse)
def get_observer_lesson_students(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_TEACHER)),
    current_user: "User" = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=200),
    course_id: int = Query(..., ge=1),
    lesson_id: int = Query(..., ge=1),
    status: str | None = Query(None),
):
    """Per-student completion breakdown for a single lesson: every enrolled student
    with their completion status, who marked it complete, and when."""
    teacher_ci_ids = set(_get_teacher_course_ids(db, current_user.id))
    if course_id not in teacher_ci_ids:
        return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    # Enrolled students (profile ids) for this course instance.
    enrolled_ids = [
        r[0]
        for r in db.query(CourseEnrollment.student_id)
        .filter(CourseEnrollment.course_instance_id == course_id)
        .distinct()
        .all()
    ]
    if not enrolled_ids:
        return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    # This lesson's completions: student profile id -> (completed_at, completed_by_id)
    completion_map: dict[int, tuple] = {}
    for sid, cat, cby in (
        db.query(
            CourseSelectionLessonCompletion.student_id,
            CourseSelectionLessonCompletion.completed_at,
            CourseSelectionLessonCompletion.completed_by_id,
        )
        .filter(
            CourseSelectionLessonCompletion.course_instance_id == course_id,
            CourseSelectionLessonCompletion.lesson_id == lesson_id,
            CourseSelectionLessonCompletion.content_type == "lesson",
        )
        .all()
    ):
        completion_map[sid] = (cat, cby)

    # Resolve names for enrolled students + the teachers who marked completions.
    completer_ids = {v[1] for v in completion_map.values() if v[1]}
    name_ids = set(enrolled_ids) | completer_ids
    name_map: dict[int, str] = {}
    if name_ids:
        for p in db.query(Profile).filter(Profile.id.in_(list(name_ids))).all():
            name_map[p.id] = f"{p.first_name} {p.middle_name or ''} {p.last_name or ''}".strip()

    rows = []
    for sid in enrolled_ids:
        comp = completion_map.get(sid)
        is_completed = comp is not None
        if status == "complete" and not is_completed:
            continue
        if status == "incomplete" and is_completed:
            continue
        rows.append({
            "student_id": sid,
            "student_name": name_map.get(sid) or f"Student {sid}",
            "completed": is_completed,
            "completed_by": name_map.get(comp[1]) if comp else None,
            "completed_at": comp[0].isoformat() if comp and comp[0] else None,
        })

    # Enrolled-but-completed students appear first, then order by name for stability.
    rows.sort(key=lambda r: (not r["completed"], r["student_name"].lower()))

    total = len(rows)
    pages = max(1, math.ceil(total / page_size))
    start = (page - 1) * page_size
    return SuccessResponse(
        data=rows[start:start + page_size],
        meta=Meta(page=page, page_size=page_size, total=total, pages=pages),
    )


def _enrich_records(db: Session, records: list, student_id: int | None = None):
    if not records:
        return []

    course_instance_ids = {r.course_id for r in records if r.course_id is not None}
    course_title_map = _build_title_map(db, course_instance_ids) if course_instance_ids else {}

    student_map = {}
    if student_id is not None:
        student_map = _load_student_map(db, {student_id})
    else:
        sids = {r.student_id for r in records}
        student_map = _load_student_map(db, sids) if sids else {}

    enriched = []
    for r in records:
        d = {c.key: getattr(r, c.key) for c in sa_inspect(r).mapper.columns}
        ci_id = r.course_id
        d["course_name"] = course_title_map.get(ci_id, "") if ci_id else ""
        display_sid = student_id if student_id is not None else r.student_id
        d["student_name"] = student_map.get(display_sid, "")
        enriched.append(d)

    return enriched


@router.get("/observer/attendance", response_model=SuccessResponse)
def get_observer_attendance(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_TEACHER)),
    current_user: "User" = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    student_id: int | None = Query(None, ge=1),
    course_id: int | None = Query(None, ge=1),
    status: str | None = Query(None),
):
    teacher_course_ids = _get_teacher_course_ids(db, current_user.id)
    if not teacher_course_ids:
        return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    # Resolve student_id param (users.id) → Profile.user_id
    target_user_id = None
    if student_id:
        target_user_id = student_id

    # Discover enrolled students in teacher's courses via CourseEnrollment → Profile
    enrollment_stmt = (
        db.query(
            CourseEnrollment.course_instance_id.label("ci_id"),
            Profile.user_id.label("user_id"),
            Profile.id.label("profile_id"),
        )
        .select_from(CourseEnrollment)
        .join(Profile, CourseEnrollment.student_id == Profile.id)
        .filter(
            CourseEnrollment.course_instance_id.in_(teacher_course_ids),
        )
    )

    if course_id:
        enrollment_stmt = enrollment_stmt.filter(CourseEnrollment.course_instance_id == course_id)

    enrollment_rows = enrollment_stmt.distinct().all()

    if not enrollment_rows:
        return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    # Filter by specific student if requested
    if target_user_id:
        enrollment_rows = [r for r in enrollment_rows if r.user_id == target_user_id]

    if not enrollment_rows:
        return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    # Build enrollment entries and collect IDs
    seen = set()
    enrollment_entries: list[dict] = []
    profile_ids: set[int] = set()
    user_ids: set[int] = set()
    ci_set: set[int] = set()
    for r in enrollment_rows:
        key = (r.ci_id, r.user_id)
        if key in seen:
            continue
        seen.add(key)
        enrollment_entries.append({
            "profile_id": r.profile_id,
            "user_id": r.user_id,
            "course_id": r.ci_id,
        })
        profile_ids.add(r.profile_id)
        user_ids.add(r.user_id)
        ci_set.add(r.ci_id)

    # Fetch display names
    s_map = _load_student_map(db, user_ids)

    # Fetch absence records: join Attendance → AttendanceStatus where Attendance.student_id (users.id) Profile.user_id
    absent_by_profile: dict[int, dict[str, str]] = {}
    profile_user_map: dict[int, int] = {}
    for p in db.query(Profile.id, Profile.user_id).filter(Profile.id.in_(list(profile_ids))).all():
        profile_user_map[p[0]] = p[1]

    if profile_ids:
        absent_rows = (
            db.query(
                AttendanceModel.student_id,
                AttendanceModel.date,
                AttendanceStatusModel.code,
            )
            .select_from(AttendanceModel)
            .join(AttendanceStatusModel, AttendanceModel.status_id == AttendanceStatusModel.id, isouter=True)
            .join(Profile, and_(
                Profile.user_id == AttendanceModel.student_id,
                Profile.id.in_(list(profile_ids)),
            ))
            .distinct()
        ).all()

        for abs_user_id, abs_date, abs_code in absent_rows:
            # Normalize truncation: 'absen' → 'absent'
            if abs_code == "absen":
                abs_code = "absent"
            # Map to profile IDs that share this user_id
            for pid, uid in profile_user_map.items():
                if uid == abs_user_id:
                    absent_by_profile.setdefault(pid, {})[abs_date.isoformat()] = abs_code

    # Gather all course date ranges
    ci_enrolled_ids = {e["course_id"] for e in enrollment_entries}
    course_date_ranges: dict[int, dict[str, str | None]] = {}
    if ci_enrolled_ids:
        for ci_id, start_raw, end_raw in db.query(
            CourseInstance.id, CourseInstance.start_date, CourseInstance.end_date
        ).filter(CourseInstance.id.in_(list(ci_enrolled_ids))).all():
            if start_raw and end_raw:
                course_date_ranges[ci_id] = {
                    "start_date": start_raw.isoformat() if start_raw else None,
                    "end_date": end_raw.isoformat() if end_raw else None,
                }

    # Compute per-student attendance with inverse logic: no absence record = present
    today = date.today()
    data_output: list[dict] = []

    for entry in enrollment_entries:
        uid = entry["user_id"]
        prof_id = entry["profile_id"]
        ci = entry["course_id"]
        cr = course_date_ranges.get(ci)
        if not cr or not cr.get("start_date") or not cr.get("end_date"):
            continue

        course_start = date.fromisoformat(cr["start_date"])
        course_end = min(date.fromisoformat(cr["end_date"]), today)
        if course_start > course_end:
            continue

        student_absents = absent_by_profile.get(prof_id, {})
        absent_count = sum(1 for s in student_absents.values() if s == "absent")
        late_count = sum(1 for s in student_absents.values() if s == "late")
        excused_count = sum(1 for s in student_absents.values() if s == "excused")
        simulation_count = sum(1 for s in student_absents.values() if s == "simulation")
        flying_count = sum(1 for s in student_absents.values() if s == "flying")

        # Count business days (Mon-Fri, no holidays) and present days
        business_days = 0
        present_days = 0
        current = course_start
        while current <= course_end:
            iso = current.isoformat()
            if iso not in KNOWN_HOLIDAYS and current.weekday() < 5:
                business_days += 1
                if iso not in student_absents:
                    present_days += 1
            current += timedelta(days=1)

        rate = round(present_days / business_days * 100, 1) if business_days > 0 else 0.0

        # Derive most recent status from absence records or default to "present"
        if student_absents:
            latest_date = max(student_absents.keys())
            latest_status = student_absents[latest_date]
        else:
            latest_date = course_end.isoformat()
            latest_status = "present"

        raw_name = s_map.get(uid, "") or ""
        student_name = raw_name.strip() or None

        data_output.append({
            "id": None,
            "course_id": ci,
            "student_id": prof_id,
            "user_id": uid,
            "date": latest_date,
            "status": latest_status,
            "created_at": None,
            "updated_at": None,
            "student_name": student_name,
            "attendance_rate": rate,
            "present_count": present_days,
            "absent_count": absent_count,
            "late_count": late_count,
            "excused_count": excused_count,
            "simulation_count": simulation_count,
            "flying_count": flying_count,
        })

    # Sort by date descending
    data_output.sort(key=lambda x: x["date"], reverse=True)

    # Aggregate stats computed BEFORE status filter — only affected by course filter
    agg_present = sum(r["present_count"] for r in data_output)
    agg_absent = sum(r["absent_count"] for r in data_output)
    agg_late = sum(r["late_count"] for r in data_output)
    agg_excused = sum(r["excused_count"] for r in data_output)
    agg_simulation = sum(r["simulation_count"] for r in data_output)
    agg_flying = sum(r["flying_count"] for r in data_output)
    agg_students = len(data_output)

    # Filter by status if specified
    if status:
        if status == "present":
            present_uids = {r["user_id"] for r in data_output if r.get("present_count", 0) > 0}
            data_output = [r for r in data_output if r["user_id"] in present_uids]
        else:
            status_uids = set()
            for entry in enrollment_entries:
                for abs_date, abs_status in absent_by_profile.get(entry["profile_id"], {}).items():
                    if abs_status == status:
                        status_uids.add(entry["user_id"])
                        break
            data_output = [r for r in data_output if r["user_id"] in status_uids]

    return SuccessResponse(
        data={
            "records": data_output,
            "aggregatedStats": {
                "present": agg_present,
                "absent": agg_absent,
                "late": agg_late,
                "excused": agg_excused,
                "simulation": agg_simulation,
                "flying": agg_flying,
                "total": agg_students,
            },
        },
        meta=Meta(page=page, page_size=page_size, total=len(data_output), pages=1),
    )


@router.get("/observer/assessment", response_model=SuccessResponse)
def get_observer_assessment(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_TEACHER)),
    current_user: "User" = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    student_id: int | None = Query(None, ge=1),
    course_id: int | None = Query(None, ge=1),
    status: str | None = Query(None),
):
    teacher_course_ids = _get_teacher_course_ids(db, current_user.id)
    if not teacher_course_ids:
        return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    if course_id:
        teacher_course_ids = [cid for cid in teacher_course_ids if cid == course_id]
        if not teacher_course_ids:
            return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    quizes = _get_quizzes_for_assessment(db, course_ids=teacher_course_ids, status_param=status or "", student_id=student_id)
    flights = _get_flight_packages_for_assessment(db, teacher_course_ids, status or "", student_id)
    forms = _get_forms_for_assessment(db, teacher_course_ids, status or "", student_id)
    surveys = _get_surveys_for_assessment(db, teacher_course_ids, status or "", student_id)

    items = quizes + flights + forms + surveys
    total = len(items)
    pages = max(1, math.ceil(total / page_size))
    paginated = items[(page - 1) * page_size : page * page_size]

    return SuccessResponse(data=paginated, meta=Meta(page=page, page_size=page_size, total=total, pages=pages))


@router.get("/observer/materials", response_model=SuccessResponse)
def get_observer_materials(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.PROGRESS_TRACKER_TEACHER)),
    current_user: "User" = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    student_id: int | None = Query(None, ge=1),
    course_id: int | None = Query(None, ge=1),
    completed: bool | None = Query(None),
    completion_state: str | None = Query(None),
):
    ci_ids = set(_get_teacher_course_ids(db, current_user.id))
    if course_id:
        ci_ids = {course_id} & ci_ids
    if not ci_ids:
        return SuccessResponse(data=[], meta=Meta(page=page, page_size=page_size, total=0, pages=0))

    files = (
        db.query(CourseSelectionMaterialFile)
        .filter(CourseSelectionMaterialFile.course_instance_id.in_(ci_ids))
        .order_by(CourseSelectionMaterialFile.created_at.desc())
        .all()
    )
    students_per_ci = _get_student_ids_per_course(db, ci_ids)
    all_sids: set[int] = set()
    for sids in students_per_ci.values():
        all_sids |= sids
    if student_id is not None:
        all_sids &= {student_id}

    file_ids = [f.id for f in files]
    progress_map: dict = {}
    if file_ids and all_sids:
        for p in (
            db.query(CourseSelectionMaterialUserProgress)
            .filter(
                CourseSelectionMaterialUserProgress.file_id.in_(file_ids),
                CourseSelectionMaterialUserProgress.user_id.in_(all_sids),
            )
            .all()
        ):
            progress_map[(p.file_id, p.user_id)] = (p.pages_read, p.total_pages)

    title_map = _build_title_map(db, ci_ids)
    student_map = _load_student_map(db, all_sids) if all_sids else {}

    # One row per (file × enrolled student); filtered to one student when requested.
    rows = []
    for f in files:
        sids = students_per_ci.get(f.course_instance_id, set())
        if student_id is not None:
            sids = sids & {student_id}
        for sid in sorted(sids):
            pr, tp = progress_map.get((f.id, sid), (0, 0))
            row = _material_row(
                f, pr, tp, title_map.get(f.course_instance_id, ""),
                student_id=sid, student_name=student_map.get(sid, ""),
            )
            if _material_passes_filters(row, pr, completed, completion_state):
                rows.append(row)

    total = len(rows)
    pages = max(1, math.ceil(total / page_size))
    start = (page - 1) * page_size
    return SuccessResponse(
        data=rows[start:start + page_size],
        meta=Meta(page=page, page_size=page_size, total=total, pages=pages),
    )
