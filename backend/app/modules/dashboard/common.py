from datetime import datetime, timedelta

from sqlalchemy import select, func, distinct
from sqlalchemy.orm import Session

from .schemas import DashboardFilterState
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
from app.modules.it_support.models import Ticket
from app.modules.profile.models import Profile
from app.modules.quiz_bank.models import QuizAttempt


# ---------------------------------------------------------------------------
# Shared helpers (mirror the ones in sat.py / instructor.py / kpis.py so the
# common dashboard sections honour the filter bar consistently).
# ---------------------------------------------------------------------------


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


def _apply_course_filters(stmt, params: DashboardFilterState | None):
    """Apply courseInstance / courseVersion / instructor filters to a statement
    built on CourseInstance."""
    from app.modules.course_master.models import CourseMaster

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


def get_alerts(db: Session, params: DashboardFilterState = None) -> list[dict]:
    """Return recent operational alerts derived from real data.

    Sources (per the document's alert examples):
      - Open IT-support tickets (recent activity)
      - Class sessions delayed beyond the operating threshold
      - Lessons where >40% of the cohort failed the quiz
      - Quiz attempts pending manual evaluation (essay questions)
    """
    alerts: list[dict] = []
    now = datetime.utcnow()
    window = _date_range_start(params) or (now - timedelta(hours=24))

    # 1. Recent open IT-support tickets (submitted/viewed)
    ticket_stmt = (
        select(Ticket.id, Ticket.title, Ticket.description, Ticket.status, Ticket.updated_at)
        .where(
            Ticket.status.in_(("submitted", "viewed")),
            Ticket.updated_at >= window,
        )
        .order_by(Ticket.updated_at.desc())
        .limit(5)
    )
    for row in db.execute(ticket_stmt).all():
        alerts.append({
            "id": _alert_id("alert-ticket", row.id),
            "title": row.title or "Support ticket",
            "description": (row.description or "")[:160],
            "time": (row.updated_at or now).strftime("%H:%M"),
            "tone": "warning",
        })

    # 2. Class sessions delayed beyond the operating threshold (> 5 min late)
    delay_stmt = (
        select(
            ClassSession.id,
            ClassSession.title,
            ClassSession.scheduled_start,
            ClassSession.actual_start,
        )
        .where(
            ClassSession.actual_start.is_not(None),
            func.extract("epoch", ClassSession.actual_start - ClassSession.scheduled_start) > 300,
            ClassSession.scheduled_start >= window,
        )
        .order_by(ClassSession.scheduled_start.desc())
        .limit(5)
    )
    if params and params.instructor != "all":
        delay_stmt = delay_stmt.join(
            Profile, Profile.user_id == ClassSession.host_user_id
        ).where(Profile.id == int(params.instructor))
    for row in db.execute(delay_stmt).all():
        alerts.append({
            "id": _alert_id("alert-delay", row.id),
            "title": f"Session delayed: {row.title}",
            "description": "Session started beyond the operating threshold.",
            "time": (row.scheduled_start or now).strftime("%H:%M"),
            "tone": "danger",
        })

    # 3. Lessons where >40% of the cohort failed the quiz
    fail_subq = (
        select(
            CourseSelectionLessonRelease.lesson_id,
            CourseSelectionLessonRelease.course_instance_id,
            func.count(QuizAttempt.id).label("total"),
            func.count(
                distinct(
                    func.nullif(
                        (QuizAttempt.score < EvaluationLessonQuiz.pass_mark), False
                    )
                )
            ).label("failed"),
        )
        .join(QuizAttempt, QuizAttempt.quiz_id == CourseSelectionLessonRelease.content_id)
        .join(EvaluationLessonQuiz, EvaluationLessonQuiz.quiz_id == QuizAttempt.quiz_id)
        .where(
            CourseSelectionLessonRelease.content_type == "quiz",
            EvaluationLessonQuiz.pass_mark > 0,
            QuizAttempt.submitted_at >= window,
        )
    )
    if params and params.courseInstance != "all":
        fail_subq = fail_subq.where(
            CourseSelectionLessonRelease.course_instance_id == int(params.courseInstance)
        )
    if params and params.instructor != "all":
        fail_subq = (
            fail_subq.join(
                CourseInstance,
                CourseSelectionLessonRelease.course_instance_id == CourseInstance.id,
            )
            .join(
                course_instructors,
                course_instructors.c.course_instance_id == CourseInstance.id,
            )
            .where(course_instructors.c.instructor_id == int(params.instructor))
        )
    fail_subq = fail_subq.group_by(
        CourseSelectionLessonRelease.lesson_id, CourseSelectionLessonRelease.course_instance_id
    ).subquery()
    fail_stmt = (
        select(fail_subq.c.lesson_id, fail_subq.c.course_instance_id, fail_subq.c.total, fail_subq.c.failed)
        .where(fail_subq.c.failed * 100 >= fail_subq.c.total * 40)
        .where(fail_subq.c.total > 0)
        .limit(5)
    )
    for row in db.execute(fail_stmt).all():
        alerts.append({
            "id": _alert_id("alert-fail", f"{row.lesson_id}-{row.course_instance_id}"),
            "title": f"High failure rate on lesson {row.lesson_id}",
            "description": f"{row.failed} of {row.total} attempts failed the quiz.",
            "time": now.strftime("%H:%M"),
            "tone": "danger",
        })

    # 4. Quiz attempts pending manual evaluation (essay questions)
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
        alerts.append({
            "id": "alert-pending-eval",
            "title": "Evaluations pending review",
            "description": f"{pending_eval_count} quiz attempts await manual grading.",
            "time": now.strftime("%H:%M"),
            "tone": "warning",
        })

    return alerts


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
    now = datetime.utcnow()
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

    cur_subq = cur_subq.group_by(
        CourseSelectionLessonRelease.lesson_id, CourseSelectionLessonRelease.course_instance_id
    ).subquery()
    prev_subq = prev_subq.group_by(
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
    now = datetime.utcnow()
    start = _date_range_start(params) or (now - timedelta(days=30))

    # Per-student aggregate: avg quiz score, attempt count, completed lessons
    from app.modules.attendance.models import Attendance
    from app.modules.attendance_status.models import AttendanceStatus

    quiz_subq = (
        select(
            QuizAttempt.student_id.label("uid"),
            func.avg(QuizAttempt.score).label("avg_score"),
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
            func.count(
                distinct(func.nullif((Attendance.status_id == AttendanceStatus.id) & (AttendanceStatus.code == present_code), False))
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
        present_ratio = (att_present / att_total) if att_total > 0 else None

        # Risk classification (document's logic, approximated)
        if avg is not None and avg < 50 and (present_ratio is not None and present_ratio < 0.5):
            level, status, next_step, tone = "Critical", "Failed evaluation / poor attendance", "Immediate intervention required", "danger"
        elif avg is not None and avg < 50:
            level, status, next_step, tone = "High", "Low evaluation score", "Schedule remedial training", "warning"
        elif (avg is not None and avg < 70) or (present_ratio is not None and present_ratio < 0.75):
            level, status, next_step, tone = "Medium", "Low quiz score / low engagement", "Monitor and review progress", "warning"
        else:
            level, status, next_step, tone = "Low", "On track", "Continue regular monitoring", "success"

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
    now = datetime.utcnow()
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
