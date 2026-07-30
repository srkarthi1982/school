from datetime import timedelta

from sqlalchemy import case, select, func, distinct
from sqlalchemy.orm import Session

from .schemas import DashboardFilterState
from .policy import (
    ACTIVE_COURSE_INSTANCE_STATUSES,
    DASHBOARD_ALERT_LIMIT,
    DASHBOARD_ALERT_SOURCE_SCAN_LIMIT,
    classify_student_risk,
    configured_pass_percentage,
    course_schedule_delay_days,
    date_range_start,
    failure_percentage,
    score_percentage,
    utc_now,
)
from .query import apply_course_instance_scope
from app.modules.class_session.models import ClassSession
from app.modules.course.models import (
    CourseEnrollment,
    CourseInstance,
    CourseModificationRequest,
    CourseModificationRequestStatus,
    course_instructors,
)
from app.modules.course_selection_schedule.lesson_content_models import (
    CourseSelectionLessonCompletion,
    CourseSelectionLessonRelease,
)
from app.modules.evaluation.models import EvaluationLessonQuiz
from app.modules.course_master.models import CourseMaster
from app.modules.it_support.models import Ticket
from app.modules.course_selection_info.models import (
    CourseSelectionInfoLessonCreationLesson,
)
from app.modules.course_selection_material.models import (
    CourseSelectionMaterialFile,
    CourseSelectionMaterialUserProgress,
)
from app.modules.profile.models import Profile
from app.modules.quiz_bank.models import QuizAttempt


# ---------------------------------------------------------------------------
# Shared helpers (mirror the ones in sat.py / instructor.py / kpis.py so the
# common dashboard sections honour the filter bar consistently).
# ---------------------------------------------------------------------------


def _date_range_start(params: DashboardFilterState | None):
    """Return the UTC datetime start of the selected date range, or None."""
    return date_range_start(params.dateRange) if params else None


def _apply_course_filters(stmt, params: DashboardFilterState | None):
    """Apply courseInstance / courseVersion / instructor filters to a statement
    built on CourseInstance."""
    return apply_course_instance_scope(stmt, params)


# ---------------------------------------------------------------------------
# Alerts
#
# The document's "Dashboard Alerts" section lists alert examples: evaluation
# missing after a flight session, student below quiz threshold, >40% of class
# failed a lesson quiz, lesson exceeded planned duration, flight booking not
# confirmed, external instructor not confirmed, student file not ready for
# export, course progress delayed. We surface real instances of these from the
# available tables (IT-support tickets, delayed class sessions, weak quiz
# cohorts, pending evaluations) — scoped by the filter bar.
# ---------------------------------------------------------------------------


def _alert_id(prefix: str, key) -> str:
    return f"{prefix}-{key}"


def get_alert_capability_section() -> dict:
    """Describe request-time alert availability without emitting fake alerts."""
    capabilities = (
        ("001", "Flight evaluation missing", "Unsupported", "No flight-session/evaluation relationship"),
        ("002", "Quiz score below threshold", "Supported", "Latest valid attempt per student, lesson, and instance"),
        ("003", "Class failure above 40%", "Supported", "Latest eligible attempt per student; strictly greater than 40%"),
        ("004", "Repeated lesson duration overrun", "Unsupported", "Generic sessions have no course or lesson relationship"),
        ("005", "Material completion with low score", "Supported", "Same student, lesson, and instance; completed page progress"),
        ("006", "Flight booking unconfirmed", "Unsupported", "No flight booking confirmation model"),
        ("007", "External instructor unconfirmed", "Unsupported", "No external invitation/confirmation model"),
        ("008", "Student export file not ready", "Unsupported", "No export-readiness workflow"),
        ("009", "Approved instance past planned end", "Partially supported", "Schedule delay only; no actual course-start timestamp"),
    )
    return {
        "id": "dashboard-alert-capabilities",
        "title": "Dynamic alert availability",
        "items": [
            {
                "id": f"alert-capability-{code}",
                "label": f"ALERT-{code} · {label}",
                "value": status,
                "helperText": reason,
                "tone": "info" if status != "Supported" else "success",
            }
            for code, label, status, reason in capabilities
        ],
    }


def get_alerts(
    db: Session,
    params: DashboardFilterState = None,
) -> list[dict]:
    """Calculate supported alert types during the current dashboard request.

    Alerts are deterministic projections: they are not persisted, acknowledged,
    scheduled, escalated, or derived from unrelated support tickets.
    """
    alerts: list[dict] = []
    now = utc_now()
    window = _date_range_start(params) or (now - timedelta(hours=24))

    # ALERT-002/003 use the latest valid attempt per student, lesson and
    # delivery instance. Matching release.student_id to the attempt user's
    # profile prevents one attempt joining every targeted release row.
    attempt_stmt = (
        select(
            QuizAttempt.id,
            QuizAttempt.student_id.label("student_user_id"),
            QuizAttempt.score,
            QuizAttempt.max_score,
            QuizAttempt.submitted_at,
            Profile.id.label("profile_id"),
            Profile.first_name.label("student_name"),
            CourseSelectionLessonRelease.lesson_id,
            CourseSelectionLessonRelease.course_instance_id,
            CourseSelectionInfoLessonCreationLesson.lesson_title,
            CourseInstance.title.label("instance_title"),
            CourseMaster.title.label("course_title"),
            CourseMaster.ctp_version,
            EvaluationLessonQuiz.pass_mark,
            EvaluationLessonQuiz.max_mark,
            EvaluationLessonQuiz.pass_percentage,
        )
        .select_from(QuizAttempt)
        .join(Profile, Profile.user_id == QuizAttempt.student_id)
        .join(
            CourseSelectionLessonRelease,
            (CourseSelectionLessonRelease.content_id == QuizAttempt.quiz_id)
            & (CourseSelectionLessonRelease.student_id == Profile.id),
        )
        .join(
            CourseInstance,
            CourseInstance.id
            == CourseSelectionLessonRelease.course_instance_id,
        )
        .join(CourseMaster, CourseMaster.id == CourseInstance.master_id)
        .join(
            EvaluationLessonQuiz,
            (EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
            & (EvaluationLessonQuiz.course_master_id == CourseMaster.id)
            & (
                EvaluationLessonQuiz.lesson_id
                == CourseSelectionLessonRelease.lesson_id
            ),
        )
        .join(
            CourseSelectionInfoLessonCreationLesson,
            CourseSelectionInfoLessonCreationLesson.id
            == CourseSelectionLessonRelease.lesson_id,
        )
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            QuizAttempt.max_score > 0,
            QuizAttempt.submitted_at >= window,
        )
        .order_by(QuizAttempt.submitted_at.desc(), QuizAttempt.id.desc())
        .limit(DASHBOARD_ALERT_SOURCE_SCAN_LIMIT)
    )
    attempt_stmt = apply_course_instance_scope(
        attempt_stmt, params, master_joined=True
    )
    if params and params.lesson != "all":
        attempt_stmt = attempt_stmt.where(
            CourseSelectionLessonRelease.lesson_id == int(params.lesson)
        )
    if params and params.student != "all":
        attempt_stmt = attempt_stmt.where(Profile.id == int(params.student))
    if params and params.evaluationType != "all":
        attempt_stmt = attempt_stmt.where(
            EvaluationLessonQuiz.assessment_type == params.evaluationType
        )

    latest: dict[tuple[int, int, int], object] = {}
    for row in db.execute(attempt_stmt).all():
        latest.setdefault(
            (row.profile_id, row.lesson_id, row.course_instance_id), row
        )

    # Completed page-progress records can be correlated to outcomes only when
    # the same student, lesson, and delivery instance are shared.
    material_stmt = (
        select(
            Profile.id.label("profile_id"),
            CourseSelectionMaterialFile.id.label("material_id"),
            CourseSelectionMaterialFile.filename,
            CourseSelectionMaterialFile.lesson_id,
            CourseSelectionMaterialFile.course_instance_id,
        )
        .select_from(CourseSelectionMaterialUserProgress)
        .join(
            CourseSelectionMaterialFile,
            CourseSelectionMaterialFile.id
            == CourseSelectionMaterialUserProgress.file_id,
        )
        .join(
            Profile,
            Profile.user_id == CourseSelectionMaterialUserProgress.user_id,
        )
        .join(
            CourseInstance,
            CourseInstance.id
            == CourseSelectionMaterialFile.course_instance_id,
        )
        .join(CourseMaster, CourseMaster.id == CourseInstance.master_id)
        .where(
            CourseSelectionMaterialUserProgress.total_pages > 0,
            CourseSelectionMaterialUserProgress.pages_read
            >= CourseSelectionMaterialUserProgress.total_pages,
        )
    )
    material_stmt = apply_course_instance_scope(
        material_stmt, params, master_joined=True
    )
    if params and params.student != "all":
        material_stmt = material_stmt.where(Profile.id == int(params.student))
    if params and params.lesson != "all":
        material_stmt = material_stmt.where(
            CourseSelectionMaterialFile.lesson_id == int(params.lesson)
        )
    if params and params.material != "all":
        material_stmt = material_stmt.where(
            CourseSelectionMaterialFile.id == params.material
        )
    completed_materials: dict[tuple[int, int, int], list[object]] = {}
    for material in db.execute(
        material_stmt.distinct().order_by(
            Profile.id,
            CourseSelectionMaterialFile.lesson_id,
            CourseSelectionMaterialFile.course_instance_id,
            CourseSelectionMaterialFile.id,
        ).limit(DASHBOARD_ALERT_SOURCE_SCAN_LIMIT)
    ).all():
        completed_materials.setdefault(
            (
                material.profile_id,
                material.lesson_id,
                material.course_instance_id,
            ),
            [],
        ).append(material)

    grouped: dict[tuple[int, int], list[tuple[object, float, float]]] = {}
    for row in latest.values():
        observed = score_percentage(row.score, row.max_score)
        if observed is None:
            continue
        threshold = configured_pass_percentage(
            pass_mark=row.pass_mark,
            configured_maximum=row.max_mark,
            pass_percentage=row.pass_percentage,
        )
        grouped.setdefault(
            (row.lesson_id, row.course_instance_id), []
        ).append((row, observed, threshold))
        if observed < threshold:
            alerts.append({
                "id": _alert_id(
                    "alert-002",
                    f"{row.profile_id}-{row.lesson_id}-{row.course_instance_id}",
                ),
                "code": "ALERT-002",
                "title": f"Quiz score below threshold: {row.lesson_title}",
                "description": (
                    f"{row.student_name or 'Student'} scored {observed:.1f}% "
                    f"against a {threshold:.1f}% threshold."
                ),
                "severity": "high",
                "dashboardRole": params.report_type if params else "leadership",
                "entityType": "quiz-attempt",
                "entityIdentifier": str(row.id),
                "course": row.course_title,
                "courseVersion": row.ctp_version,
                "courseInstance": row.instance_title,
                "student": row.student_name,
                "lesson": row.lesson_title,
                "currentValue": f"{observed:.1f}%",
                "threshold": f"{threshold:.1f}%",
                "generatedTimestamp": now.isoformat(),
                "recommendedAction": "Review the lesson and assigned material.",
                "time": now.strftime("%H:%M"),
                "tone": "danger",
            })
            for material in completed_materials.get(
                (row.profile_id, row.lesson_id, row.course_instance_id), []
            ):
                alerts.append({
                    "id": _alert_id(
                        "alert-005",
                        f"{row.profile_id}-{material.material_id}-{row.lesson_id}-{row.course_instance_id}",
                    ),
                    "code": "ALERT-005",
                    "title": f"Completed material with low score: {row.lesson_title}",
                    "description": (
                        f"{row.student_name or 'Student'} completed "
                        f"{material.filename} but scored {observed:.1f}%."
                    ),
                    "severity": "warning",
                    "dashboardRole": params.report_type if params else "leadership",
                    "entityType": "material-quiz-correlation",
                    "entityIdentifier": (
                        f"{material.material_id}:{row.id}"
                    ),
                    "course": row.course_title,
                    "courseVersion": row.ctp_version,
                    "courseInstance": row.instance_title,
                    "student": row.student_name,
                    "lesson": row.lesson_title,
                    "currentValue": f"Material complete; score {observed:.1f}%",
                    "threshold": f"Quiz threshold {threshold:.1f}%",
                    "generatedTimestamp": now.isoformat(),
                    "recommendedAction": "Review the material and lesson with the student.",
                    "time": now.strftime("%H:%M"),
                    "tone": "warning",
                })

    for (lesson_id, instance_id), observations in grouped.items():
        failed = sum(observed < threshold for _, observed, threshold in observations)
        total = len(observations)
        percentage = failure_percentage(total, failed)
        if total and percentage > 40 and (
            not params or params.report_type != "student"
        ):
            row = observations[0][0]
            alerts.append({
                "id": _alert_id("alert-003", f"{lesson_id}-{instance_id}"),
                "code": "ALERT-003",
                "title": f"Class failure above 40%: {row.lesson_title}",
                "description": (
                    f"{failed} of {total} students' latest eligible attempts "
                    f"failed ({percentage:.1f}%)."
                ),
                "severity": "critical",
                "dashboardRole": params.report_type if params else "leadership",
                "entityType": "lesson-course-instance",
                "entityIdentifier": f"{lesson_id}:{instance_id}",
                "course": row.course_title,
                "courseVersion": row.ctp_version,
                "courseInstance": row.instance_title,
                "lesson": row.lesson_title,
                "currentValue": f"{failed}/{total} ({percentage:.1f}%)",
                "threshold": ">40%",
                "generatedTimestamp": now.isoformat(),
                "recommendedAction": "Review lesson delivery and assign targeted remediation.",
                "time": now.strftime("%H:%M"),
                "tone": "danger",
            })

    # ALERT-009: approved delivery instances that have not started after their
    # planned start or remain approved beyond their planned end. The schema has
    # no actual course-start timestamp, so this is explicitly schedule delay.
    today = now.date()
    delay_stmt = (
        select(
            CourseInstance.id,
            CourseInstance.title,
            CourseInstance.start_date,
            CourseInstance.end_date,
            CourseInstance.status,
            CourseMaster.title.label("course_title"),
            CourseMaster.ctp_version,
        )
        .select_from(CourseInstance)
        .join(CourseMaster, CourseMaster.id == CourseInstance.master_id)
        .where(
            func.lower(CourseInstance.status).in_(
                ACTIVE_COURSE_INSTANCE_STATUSES
            ),
            CourseInstance.end_date.is_not(None),
            CourseInstance.end_date < today,
        )
    )
    delay_stmt = apply_course_instance_scope(
        delay_stmt, params, master_joined=True
    )
    delay_rows = (
        []
        if params and params.report_type == "student"
        else db.execute(
            delay_stmt.order_by(
                CourseInstance.end_date.asc(), CourseInstance.id.asc()
            ).limit(DASHBOARD_ALERT_LIMIT)
        ).all()
    )
    for row in delay_rows:
        days = course_schedule_delay_days(
            status=row.status, planned_end=row.end_date, today=today
        )
        if days is None:
            continue
        alerts.append({
            "id": _alert_id("alert-009", row.id),
            "code": "ALERT-009",
            "title": f"Approved instance past planned end: {row.title}",
            "description": (
                f"Planned end {row.end_date.isoformat()} passed by {days} day(s); "
                f"status remains {row.status}."
            ),
            "severity": "high",
            "dashboardRole": params.report_type if params else "leadership",
            "entityType": "course-instance",
            "entityIdentifier": str(row.id),
            "course": row.course_title,
            "courseVersion": row.ctp_version,
            "courseInstance": row.title,
            "currentValue": f"{days} day(s) past planned end",
            "threshold": "Planned end date passed",
            "generatedTimestamp": now.isoformat(),
            "recommendedAction": "Review the delivery status and planned end date.",
            "time": now.strftime("%H:%M"),
            "tone": "danger",
        })

    ordered = sorted(
        {alert["id"]: alert for alert in alerts}.values(),
        key=lambda alert: (
            {"critical": 0, "high": 1, "warning": 2, "info": 3}[
                alert["severity"]
            ],
            alert["code"],
            alert["id"],
        ),
    )
    return ordered[:DASHBOARD_ALERT_LIMIT]


# ---------------------------------------------------------------------------
# Weak lessons (the "Repeated weak lessons" / "Lessons with repeated weak quiz
# scores" detail section shared across views).
# ---------------------------------------------------------------------------


def get_week_lessons(db: Session, params: DashboardFilterState = None) -> list[dict]:
    """Return weak-lesson rows: lessons where students scored below the quiz
    pass mark, with the cohort (course instance), average score, and trend.

    The "trend" compares the average score in the selected date range against
    the average score in the preceding equal-length window (improvement = +).
    """
    now = utc_now()
    start = _date_range_start(params) or (now - timedelta(days=7))
    span = now - start
    prev_start = start - span

    # Average score per (lesson, course_instance) in the current window
    cur_subq = (
        select(
            CourseSelectionLessonRelease.lesson_id,
            CourseSelectionLessonRelease.course_instance_id,
            func.avg(QuizAttempt.score).label("avg_score"),
        )
        .join(QuizAttempt, QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
        .join(EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            EvaluationLessonQuiz.pass_mark > 0,
            QuizAttempt.score < EvaluationLessonQuiz.pass_mark,
            QuizAttempt.submitted_at >= start,
            QuizAttempt.submitted_at < now,
        )
    )
    # Average score per (lesson, course_instance) in the previous window
    prev_subq = (
        select(
            CourseSelectionLessonRelease.lesson_id,
            CourseSelectionLessonRelease.course_instance_id,
            func.avg(QuizAttempt.score).label("prev_avg_score"),
        )
        .join(QuizAttempt, QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
        .join(EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            EvaluationLessonQuiz.pass_mark > 0,
            QuizAttempt.score < EvaluationLessonQuiz.pass_mark,
            QuizAttempt.submitted_at >= prev_start,
            QuizAttempt.submitted_at < start,
        )
    )

    # Apply filters to both subqueries
    scoped_subqueries = []
    for subq in (cur_subq, prev_subq):
        if params and params.courseInstance != "all":
            subq = subq.where(
                CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
            )
        if params and params.lesson != "all":
            subq = subq.where(CourseSelectionLessonRelease.lesson_id == int(params.lesson))
        if params and params.instructor != "all":
            subq = (
                subq.join(
                    CourseInstance,
                    CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
                )
                .join(
                    course_instructors,
                    course_instructors.c.course_instance_id == CourseInstance.id,
                )
                .where(course_instructors.c.instructor_id == int(params.instructor))
            )
        if params and params.evaluationType != "all":
            subq = subq.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
        if params and params.student != "all":
            subq = subq.join(Profile, Profile.user_id == QuizAttempt.student_id).where(
                Profile.id == int(params.student)
            )
        scoped_subqueries.append(subq)

    cur_subq = scoped_subqueries[0].group_by(
        CourseSelectionLessonRelease.lesson_id, CourseSelectionLessonRelease.course_instance_id
    ).subquery()
    prev_subq = scoped_subqueries[1].group_by(
        CourseSelectionLessonRelease.lesson_id, CourseSelectionLessonRelease.course_instance_id
    ).subquery()

    stmt = (
        select(
            cur_subq.c.lesson_id,
            cur_subq.c.course_instance_id,
            cur_subq.c.avg_score,
            prev_subq.c.prev_avg_score,
        )
        .outerjoin(
            prev_subq,
            (prev_subq.c.lesson_id == cur_subq.c.lesson_id)
            & (prev_subq.c.course_instance_id == cur_subq.c.course_instance_id),
        )
        .order_by(cur_subq.c.avg_score.asc())
        .limit(10)
    )

    rows = db.execute(stmt).all()
    items: list[dict] = []
    for r in rows:
        avg = float(r.avg_score or 0)
        prev = float(r.prev_avg_score) if r.prev_avg_score is not None else None
        if prev is None:
            trend = "—"
        else:
            delta = avg - prev
            trend = f"+{delta:.1f}" if delta >= 0 else f"{delta:.1f}"
        items.append({
            "id": f"weak-{r.lesson_id}-{r.course_instance_id}",
            "lesson": f"Lesson {r.lesson_id}",
            "cohort": f"Instance {r.course_instance_id} | Trend {trend}",
            "score": f"{avg:.0f}%",
            "trend": trend,
        })
    return items


# ---------------------------------------------------------------------------
# Risk statuses (Student KPIs risk logic from the document).
# ---------------------------------------------------------------------------


def get_risk_statuses(db: Session, params: DashboardFilterState = None) -> list[dict]:
    """Return student risk-status rows derived from the document's risk logic:

        Low      -> progress normal + scores above threshold
        Medium   -> low quiz score or low engagement
        High     -> low evaluation score + poor attendance
        Critical -> failed evaluation or missed mandatory training

    We approximate the thresholds with the available data: average quiz score
    (pass/fail), lesson completion progress, and attendance (present ratio).
    Each row maps a student profile to a risk level with a next-step.
    """
    now = utc_now()
    start = _date_range_start(params) or (now - timedelta(days=30))

    # Per-student aggregate: avg quiz score, attempt count, completed lessons
    from app.modules.attendance.models import Attendance
    from app.modules.attendance_status.models import AttendanceStatus

    quiz_subq = (
        select(
            QuizAttempt.student_id.label("uid"),
            func.avg(
                case(
                    (QuizAttempt.max_score > 0, QuizAttempt.score * 100.0 / QuizAttempt.max_score),
                    else_=None,
                )
            ).label("avg_score"),
            func.count(QuizAttempt.id).label("attempts"),
        )
        .join(
            CourseSelectionLessonRelease,
            QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id,
        )
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            QuizAttempt.submitted_at >= start,
        )
    )
    if params and params.courseInstance != "all":
        quiz_subq = quiz_subq.where(
            CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
        )
    if params and params.student != "all":
        quiz_subq = quiz_subq.join(Profile, Profile.user_id == QuizAttempt.student_id).where(
            Profile.id == int(params.student)
        )
    quiz_subq = quiz_subq.group_by(QuizAttempt.student_id).subquery()

    # Attendance present ratio per student (users.id keyed)
    present_code = "present"
    att_subq = (
        select(
            Attendance.student_id.label("uid"),
            func.count(Attendance.id).label("att_total"),
            func.sum(
                case((AttendanceStatus.code == present_code, 1), else_=0)
            ).label("att_present"),
        )
        .join(AttendanceStatus, Attendance.status_id == AttendanceStatus.id, isouter=True)
        .where(Attendance.date >= start.date())
    )
    if params and params.student != "all":
        att_subq = att_subq.join(Profile, Profile.user_id == Attendance.student_id).where(
            Profile.id == int(params.student)
        )
    att_subq = att_subq.group_by(Attendance.student_id).subquery()

    stmt = (
        select(
            Profile.id,
            Profile.first_name,
            quiz_subq.c.avg_score,
            quiz_subq.c.attempts,
            att_subq.c.att_total,
            att_subq.c.att_present,
        )
        .join(quiz_subq, quiz_subq.c.uid == Profile.user_id, isouter=True)
        .join(att_subq, att_subq.c.uid == Profile.user_id, isouter=True)
    )
    if params and params.student != "all":
        stmt = stmt.where(Profile.id == int(params.student))
    if params and params.instructor != "all":
        stmt = stmt.join(
            CourseEnrollment, CourseEnrollment.student_id == Profile.id
        ).join(
            course_instructors,
            course_instructors.c.course_instance_id == CourseEnrollment.course_instance_id,
        ).where(course_instructors.c.instructor_id == int(params.instructor))
    stmt = stmt.limit(20)

    rows = db.execute(stmt).all()
    items: list[dict] = []
    for r in rows:
        avg = float(r.avg_score) if r.avg_score is not None else None
        attempts = int(r.attempts or 0)
        att_total = int(r.att_total or 0)
        att_present = int(r.att_present or 0)
        attendance_percent = (
            (att_present / att_total) * 100 if att_total > 0 else None
        )
        level, status, next_step, tone = classify_student_risk(
            avg, attendance_percent
        )

        items.append({
            "id": f"risk-{r.id}",
            "area": f"{r.first_name or 'Student'} {r.id}",
            "owner": "Program Lead",
            "status": status,
            "riskLevel": tone,
            "nextStep": next_step,
        })
    return items


# ---------------------------------------------------------------------------
# Pending actions
# ---------------------------------------------------------------------------


def get_pending_actions(db: Session, params: DashboardFilterState = None) -> list[dict]:
    """Return pending-action rows derived from real open work items:

      - Open IT-support tickets (submitted/viewed)
      - Course modification requests awaiting approval (WAIT_APPROVAL)
      - Quiz attempts pending manual evaluation (has_essay)
    """
    actions: list[dict] = []
    now = utc_now()
    window = _date_range_start(params) or (now - timedelta(days=7))

    # 1. Open tickets
    ticket_stmt = (
        select(Ticket.id, Ticket.title, Ticket.created_at)
        .where(Ticket.status.in_(("submitted", "viewed")))
        .order_by(Ticket.created_at.asc())
        .limit(5)
    )
    for row in db.execute(ticket_stmt).all():
        days = (now.date() - (row.created_at.date() if row.created_at else now.date())).days
        due = "Overdue" if days > 2 else ("Today" if days <= 0 else f"{days}d")
        actions.append({
            "id": f"action-ticket-{row.id}",
            "title": row.title or "Resolve support ticket",
            "owner": "Support Ops",
            "due": due,
            "tone": "danger" if days > 2 else "warning",
        })

    # 2. Course modification requests awaiting approval
    mod_stmt = (
        select(CourseModificationRequest.id, CourseModificationRequest.course_id, CourseModificationRequest.created_at)
        .where(CourseModificationRequest.status == CourseModificationRequestStatus.WAIT_FOR_APPROVAL.value)
        .order_by(CourseModificationRequest.created_at.asc())
        .limit(5)
    )
    if params and params.courseInstance != "all":
        mod_stmt = mod_stmt.where(CourseModificationRequest.course_id == int(params.courseInstance))
    for row in db.execute(mod_stmt).all():
        days = (now.date() - (row.created_at.date() if row.created_at else now.date())).days
        due = "Overdue" if days > 2 else ("Today" if days <= 0 else f"{days}d")
        actions.append({
            "id": f"action-mod-{row.id}",
            "title": f"Approve course modification #{row.course_id}",
            "owner": "Course Admin",
            "due": due,
            "tone": "warning",
        })

    # 3. Pending evaluations (essay quiz attempts)
    pending_eval_stmt = (
        select(func.count(QuizAttempt.id))
        .join(
            CourseSelectionLessonRelease,
            QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id,
        )
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            QuizAttempt.has_essay.is_(True),
            QuizAttempt.submitted_at >= window,
        )
    )
    if params and params.courseInstance != "all":
        pending_eval_stmt = pending_eval_stmt.where(
            CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
        )
    pending_eval_count = db.execute(pending_eval_stmt).scalar() or 0
    if pending_eval_count > 0:
        actions.append({
            "id": "action-pending-eval",
            "title": f"Grade {pending_eval_count} pending evaluations",
            "owner": "Instructor",
            "due": "Today",
            "tone": "warning",
        })

    return actions


# ---------------------------------------------------------------------------
# Export readiness
# ---------------------------------------------------------------------------


def get_export_readiness(db: Session, params: DashboardFilterState = None) -> list[dict]:
    """Return export-readiness rows.

    No export-jobs data source exists in the codebase yet (confirmed by a full
    tree search — there is no export-jobs table or model). This remains a
    documented placeholder returning an empty list so the dashboard renders
    cleanly; wire it up once the export-jobs table lands.
    """
    return []
