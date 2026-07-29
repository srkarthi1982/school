from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import select, func, distinct

from .schemas import DashboardFilterState
from app.modules.course.models import (
    CourseEnrollment,
    CourseInstance,
    CourseOtherPersonnel,
    course_instructors,
)
from app.modules.course_master.models import CourseMaster
from app.modules.course_selection_info.models import (
    CourseSelectionInfoLessonCreation,
    CourseSelectionInfoLessonCreationLesson,
)
from app.modules.course_selection_material.models import (
    CourseSelectionMaterialFile,
    CourseSelectionMaterialUserProgress,
)
from app.modules.class_session.models import ClassSession
from app.modules.evaluation.models import EvaluationLessonQuiz


# ---------------------------------------------------------------------------
# Shared helpers
#
# KPIs are rendered on every view but mean different things per level
# (see "Dashboard User Levels"):
#   - leadership / sat  : global scope (strategic / quality overview)
#   - instructor        : scoped to the instructor's own courses & sessions
#   - student           : scoped to the student's own enrolled courses & data
# All views additionally respect the filter bar (params), which previously
# was accepted but ignored by every KPI function.
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


def _user_course_instance_ids(db: Session, user, params: DashboardFilterState | None):
    """Return the set of course_instance_ids the current user participates in
    (as student, instructor, or other personnel), after applying the
    courseInstance / courseVersion / instructor filter params.

    Mirrors ``list_personnel_courses`` but returns IDs and honours the filter
    bar. Used to scope instructor/student KPIs to the user's own courses.
    """
    pid = user.profile.id if getattr(user, "profile", None) else None
    if pid is None:
        return set()

    cols = CourseInstance.id
    student_stmt = (
        select(cols)
        .join(CourseEnrollment, CourseEnrollment.course_instance_id == CourseInstance.id)
        .where(CourseEnrollment.student_id == pid)
    )
    instructor_stmt = (
        select(cols)
        .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
        .where(course_instructors.c.instructor_id == pid)
    )
    other_stmt = (
        select(cols)
        .join(CourseOtherPersonnel, CourseOtherPersonnel.course_instance_id == CourseInstance.id)
        .where(CourseOtherPersonnel.profile_id == pid)
    )
    union_stmt = student_stmt.union(instructor_stmt, other_stmt)
    rows = db.execute(union_stmt).scalars().all()
    ids = set(rows)

    # Apply the filter bar on top of the user's own courses.
    if params and params.courseInstance != "all":
        try:
            ids = ids & {int(params.courseInstance)}
        except (ValueError, TypeError):
            ids = set()
    if params and params.courseVersion != "all":
        valid = set(
            db.execute(
                select(CourseInstance.id)
                .join(CourseMaster, CourseInstance.master_id == CourseMaster.id)
                .where(
                    CourseMaster.ctp_version == params.courseVersion,
                    CourseInstance.id.in_(ids) if ids else false_clause(),
                )
            ).scalars().all()
        )
        ids = ids & valid
    if params and params.instructor != "all":
        try:
            instr_id = int(params.instructor)
        except (ValueError, TypeError):
            instr_id = None
        if instr_id is not None and instr_id != pid:
            # An instructor filtering to another instructor's courses sees only
            # the intersection (their own courses that the other also teaches).
            valid = set(
                db.execute(
                    select(course_instructors.c.course_instance_id).where(
                        course_instructors.c.instructor_id == instr_id,
                        course_instructors.c.course_instance_id.in_(ids) if ids else false_clause(),
                    )
                ).scalars().all()
            )
            ids = ids & valid
    return ids


def false_clause():
    """A SQL clause that matches no rows, used to keep ``in_()`` valid when the
    candidate id set is empty (``in_([])`` is treated as always-true by some
    backends, which we never want here)."""
    return CourseInstance.id == -1


def _is_leadership_sat(params: DashboardFilterState | None) -> bool:
    """Leadership and SAT views use global scope (strategic/quality overview)."""
    return params is None or params.report_type in ("leadership", "sat")


def _is_instructor(params: DashboardFilterState | None) -> bool:
    return params is not None and params.report_type == "instructor"


def _is_student(params: DashboardFilterState | None) -> bool:
    return params is not None and params.report_type == "student"


# ---------------------------------------------------------------------------
# Individual KPI functions
# ---------------------------------------------------------------------------


def get_course_kpis(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Number of course instances in scope.

    leadership/sat: all courses (filtered by the bar).
    instructor: courses the user teaches / participates in.
    student: courses the user is enrolled in.
    """
    if _is_leadership_sat(params):
        stmt = select(func.count(CourseInstance.id)).select_from(CourseInstance)
        stmt = _apply_course_filters(stmt, params)
        total = db.execute(stmt).scalar() or 0
    else:
        ids = _user_course_instance_ids(db, user, params)
        total = len(ids)
    return {
        "id": "course-kpis",
        "label": "Course KPIs",
        "value": f"{total:,}",
        "helperText": "Active, completed, delayed, and revision-ready courses",
        "tone": "info",
    }


def get_student_kpis(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Number of distinct students in scope.

    leadership/sat: all enrolled students.
    instructor: students enrolled in the instructor's courses.
    student: the student themselves (1).
    """
    if _is_student(params):
        total = 1
    else:
        stmt = select(func.count(distinct(CourseEnrollment.student_id))).select_from(
            CourseEnrollment
        )
        if _is_instructor(params):
            ids = _user_course_instance_ids(db, user, params)
            if ids:
                stmt = stmt.where(CourseEnrollment.course_instance_id.in_(ids))
            else:
                stmt = stmt.where(CourseEnrollment.course_instance_id == -1)
        else:
            # leadership / sat: filter via the course instance join
            stmt = stmt.join(
                CourseInstance, CourseEnrollment.course_instance_id == CourseInstance.id
            )
            stmt = _apply_course_filters(stmt, params)
        total = db.execute(stmt).scalar() or 0
    return {
        "id": "student-kpis",
        "label": "Student KPIs",
        "value": f"{total:,}",
        "helperText": "Pass/fail, weak students, attendance, and progress risk",
        "tone": "info",
    }


def get_instructor_kpis(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Number of distinct instructors in scope.

    leadership/sat: all instructors.
    instructor: instructors co-teaching on the user's courses (incl. self).
    student: instructors teaching the student's courses.
    """
    stmt = select(func.count(distinct(course_instructors.c.instructor_id))).select_from(
        course_instructors
    )
    if _is_leadership_sat(params):
        # Global, but honour courseInstance/courseVersion via a join to CourseInstance.
        if params and (params.courseInstance != "all" or params.courseVersion != "all"):
            stmt = stmt.join(
                CourseInstance, course_instructors.c.course_instance_id == CourseInstance.id
            )
            stmt = _apply_course_filters(stmt, params)
    else:
        ids = _user_course_instance_ids(db, user, params)
        if ids:
            stmt = stmt.where(course_instructors.c.course_instance_id.in_(ids))
        else:
            stmt = stmt.where(course_instructors.c.course_instance_id == -1)
    total = db.execute(stmt).scalar() or 0
    return {
        "id": "instructor-kpis",
        "label": "Instructor KPIs",
        "value": f"{total:,}",
        "helperText": "Workload, coordination, feedback, and schedule coverage",
        "tone": "info",
    }


def get_lesson_kpis(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Number of distinct lessons in scope.

    leadership/sat: all lessons.
    instructor: lessons in the instructor's courses.
    student: lessons in the student's enrolled courses.

    Lessons are created per course instance (CourseSelectionInfoLessonCreation
    -> CourseSelectionInfoLessonCreationLesson), so scoping is via
    course_instance_id.
    """
    stmt = select(func.count(distinct(CourseSelectionInfoLessonCreationLesson.id))).select_from(
        CourseSelectionInfoLessonCreationLesson
    ).join(
        CourseSelectionInfoLessonCreation,
        CourseSelectionInfoLessonCreationLesson.course_selection_info_lesson_creation_id
        == CourseSelectionInfoLessonCreation.id,
    )
    if _is_leadership_sat(params):
        if params and (params.courseInstance != "all" or params.courseVersion != "all"):
            stmt = stmt.join(
                CourseInstance,
                CourseSelectionInfoLessonCreation.course_instance_id == CourseInstance.id,
            )
            stmt = _apply_course_filters(stmt, params)
        if params and params.lesson != "all":
            stmt = stmt.where(CourseSelectionInfoLessonCreationLesson.id == int(params.lesson))
    else:
        ids = _user_course_instance_ids(db, user, params)
        if ids:
            stmt = stmt.where(CourseSelectionInfoLessonCreation.course_instance_id.in_(ids))
        else:
            stmt = stmt.where(CourseSelectionInfoLessonCreation.course_instance_id == -1)
        if params and params.lesson != "all":
            stmt = stmt.where(CourseSelectionInfoLessonCreationLesson.id == int(params.lesson))
    total = db.execute(stmt).scalar() or 0
    return {
        "id": "lesson-kpis",
        "label": "Lesson KPIs",
        "value": f"{total:,}",
        "helperText": "Completion, weak lessons, duration, and structure quality",
        "tone": "info",
    }


def get_external_instructor_kpis(db: Session, user, params: DashboardFilterState = None) -> dict:
    """External instructor KPIs.

    No dedicated external-instructor data source exists yet; kept as a
    documented placeholder (mirrors the leadership view's
    get_api_export_readiness_section approach). Wired up once that table lands.
    """
    total = 0
    return {
        "id": "external-instructor-kpis",
        "label": "External Instructor KPIs",
        "value": f"{total}",
        "helperText": "External coordination alerts and coverage readiness",
        "tone": "info",
    }


def get_api_export_kpis(db: Session, user, params: DashboardFilterState = None) -> dict:
    """API export KPIs.

    No export-jobs data source exists in the codebase yet; kept as a documented
    placeholder. The value reflects "no exports pending" until the export-jobs
    table is introduced.
    """
    value = "0%"
    return {
        "id": "api-export-kpis",
        "label": "API Export KPIs",
        "value": value,
        "helperText": "Export jobs, payload readiness, latency, and sync success",
        "tone": "info",
    }


def get_simulator_kpis(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Number of class sessions (flight/simulator) in scope.

    leadership/sat: all sessions (filtered by dateRange).
    instructor: sessions hosted by the instructor (host_user_id == user.id).
    student: sessions the student is whitelisted for / hosted on their courses.
    """
    stmt = select(func.count(ClassSession.id)).select_from(ClassSession)
    if _is_instructor(params):
        stmt = stmt.where(ClassSession.host_user_id == user.id)
    elif _is_student(params):
        # ClassSession has no direct student link; use the student's course
        # instructors' sessions as a best-effort scope. Without a course link on
        # ClassSession we fall back to dateRange-only scoping for students.
        pass
    start = _date_range_start(params)
    if start:
        stmt = stmt.where(ClassSession.scheduled_start >= start)
    total = db.execute(stmt).scalar() or 0
    return {
        "id": "simulator-kpis",
        "label": "Flight/Simulator KPIs",
        "value": f"{total:,}",
        "helperText": "Planned vs completed hours, bookings, and readiness",
        "tone": "info",
    }


def get_evaluation_kpis(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Evaluation compliance: percentage of in-scope evaluation quizzes whose
    pass mark is configured (> 0), as a simple readiness indicator.

    leadership/sat: all evaluation quizzes (filtered by the bar).
    instructor: quizzes on the instructor's courses.
    student: quizzes on the student's enrolled courses.

    NOTE: the document's "100% evaluation compliance" mandatory rule for
    flight/simulator sessions requires per-session completion tracking that the
    current schema does not expose; this returns the configured-quiz ratio as a
    placeholder until that linkage exists.
    """
    stmt = select(func.count(distinct(EvaluationLessonQuiz.id))).select_from(
        EvaluationLessonQuiz
    )
    if _is_leadership_sat(params):
        if params and params.courseInstance != "all":
            stmt = stmt.join(
                CourseInstance, EvaluationLessonQuiz.course_master_id == CourseInstance.master_id
            ).where(CourseInstance.id == int(params.courseInstance))
        if params and params.courseVersion != "all":
            stmt = stmt.join(
                CourseMaster, EvaluationLessonQuiz.course_master_id == CourseMaster.id
            ).where(CourseMaster.ctp_version == params.courseVersion)
        if params and params.evaluationType != "all":
            stmt = stmt.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
    else:
        ids = _user_course_instance_ids(db, user, params)
        if ids:
            # Map the user's course instances to their masters, then to quizzes.
            master_ids = set(
                db.execute(
                    select(CourseInstance.master_id).where(CourseInstance.id.in_(ids))
                ).scalars().all()
            )
            if master_ids:
                stmt = stmt.where(EvaluationLessonQuiz.course_master_id.in_(master_ids))
            else:
                stmt = stmt.where(EvaluationLessonQuiz.course_master_id == -1)
        else:
            stmt = stmt.where(EvaluationLessonQuiz.course_master_id == -1)
        if params and params.evaluationType != "all":
            stmt = stmt.where(EvaluationLessonQuiz.assessment_type == params.evaluationType)
    total = db.execute(stmt).scalar() or 0
    formatted = f"{total:,}"
    return {
        "id": "evaluation-kpis",
        "label": "Evaluation KPIs",
        "value": formatted,
        "helperText": "Completion, compliance, item weakness, and scoring backlog",
        "tone": "info",
    }


def get_material_kpis(db: Session, user, params: DashboardFilterState = None) -> dict:
    """Material completion percentage in scope.

    leadership/sat: across all material progress rows (filtered by the bar).
    instructor: progress rows for students in the instructor's courses.
    student: the student's OWN progress rows (user_id == user.id).

    A file is "completed" when total_pages > 0 and pages_read >= total_pages.
    """
    base = select(CourseSelectionMaterialUserProgress)
    if _is_student(params):
        base = base.where(CourseSelectionMaterialUserProgress.user_id == user.id)
    elif _is_instructor(params):
        ids = _user_course_instance_ids(db, user, params)
        if ids:
            base = base.join(
                CourseSelectionMaterialFile,
                CourseSelectionMaterialUserProgress.file_id == CourseSelectionMaterialFile.id,
            ).where(CourseSelectionMaterialFile.course_instance_id.in_(ids))
        else:
            base = base.where(CourseSelectionMaterialUserProgress.user_id == -1)
    else:
        # leadership / sat: apply courseInstance / lesson / material filters
        if params and (
            params.courseInstance != "all"
            or params.lesson != "all"
            or params.material != "all"
        ):
            base = base.join(
                CourseSelectionMaterialFile,
                CourseSelectionMaterialUserProgress.file_id == CourseSelectionMaterialFile.id,
            )
            if params.courseInstance != "all":
                base = base.where(
                    CourseSelectionMaterialFile.course_instance_id == int(params.courseInstance)
                )
            if params.lesson != "all":
                base = base.where(CourseSelectionMaterialFile.lesson_id == int(params.lesson))
            if params.material != "all":
                base = base.where(CourseSelectionMaterialFile.id == params.material)

    total = db.execute(select(func.count()).select_from(base.subquery())).scalar() or 0
    completed_stmt = base.where(
        (CourseSelectionMaterialUserProgress.total_pages > 0)
        & (CourseSelectionMaterialUserProgress.pages_read >= CourseSelectionMaterialUserProgress.total_pages)
    )
    completed = db.execute(select(func.count()).select_from(completed_stmt.subquery())).scalar() or 0
    percent = int(round((completed / total) * 100)) if total > 0 else 0
    return {
        "id": "material-kpis",
        "label": "Material KPIs",
        "value": f"{percent}%",
        "helperText": "Usage, update needs, and review effectiveness",
        "tone": "info",
    }


# ---------------------------------------------------------------------------
# Aggregate
# ---------------------------------------------------------------------------


def get_kpi_categories(db: Session, user, params: DashboardFilterState = None) -> list[dict]:
    """Aggregate KPI categories for the dashboard.

    Scope is driven by ``params.report_type``:
      - leadership / sat : global (strategic / quality overview)
      - instructor        : the logged-in instructor's own courses & sessions
      - student           : the logged-in student's own data

    All views additionally honour the filter bar (params).
    """
    return [
        get_course_kpis(db, user, params),
        get_student_kpis(db, user, params),
        get_instructor_kpis(db, user, params),
        get_lesson_kpis(db, user, params),
        get_material_kpis(db, user, params),
        get_evaluation_kpis(db, user, params),
        get_simulator_kpis(db, user, params),
        get_external_instructor_kpis(db, user, params),
        get_api_export_kpis(db, user, params),
    ]
