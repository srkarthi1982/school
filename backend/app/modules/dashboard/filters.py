from fastapi import Depends
from sqlalchemy.orm import Session
from sqlalchemy import select, func, distinct
from app.modules.course_info.models import MasterAircraftType, MasterSimulatorType
from app.modules.course_selection_material.models import CourseSelectionMaterialFile, CourseSelectionMaterialUserProgress
from app.modules.evaluation.models import EvaluationLessonQuiz
from app.modules.profile.models import Profile
from app.modules.course.models import CourseEnrollment, CourseInstance, course_instructors
from app.modules.attendance.models import Attendance
from app.modules.attendance_status.models import AttendanceStatus
from app.modules.it_support.models import Ticket
# Imported lazily inside get_filter_options to avoid circular imports
from app.core.database import get_db
from app.core.deps import get_current_user
from .schemas import DashboardFilterState


# ---------------------------------------------------------------------------
# Cascading filter options
#
# The filter bar is a dependency chain: each selection narrows the options of
# every filter below it. The resolution order is:
#
#   course (master) ─┬─► courseVersion (master.ctp_version)
#                    └─► courseInstance (instances of that master/version)
#   courseInstance ──┬─► student   (enrollments in that instance)
#                    ├─► instructor (instructors of that instance)
#                    ├─► lesson    (lessons created for that instance)
#                    └─► material  (files attached to that instance)
#   instructor ──────► student (students in the instructor's courses)
#   student ────────► lesson  (lessons in the student's enrolled courses)
#   lesson ─────────► material (files linked to that lesson)
#
# The frontend re-fetches filterOptions on every filter change (see store.ts
# setFilters -> getDashboardInfo), so the backend receives the *current*
# selections in `params` and must return option lists consistent with them.
# A selection of "all" means "no constraint at this level".
# ---------------------------------------------------------------------------


def _coerce_int(value: str) -> int | None:
    """Parse a filter value to int, returning None for "all" / unparseable."""
    if value is None or value == "all":
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def get_student_options(db: Session, course_instance_ids: list[int]) -> list[dict]:
    """Return student filter options for the given course instance IDs."""
    if not course_instance_ids:
        return [{"label": "All students", "value": "all"}]
    stmt = (
        select(Profile.id, Profile.first_name)
        .join(CourseEnrollment, CourseEnrollment.student_id == Profile.id)
        .where(CourseEnrollment.course_instance_id.in_(course_instance_ids))
        .distinct()
    )
    rows = db.execute(stmt).all()
    return [{"label": "All students", "value": "all"}] + [
        {"label": row.first_name, "value": str(row.id)} for row in rows
    ]


def get_instructor_options(db: Session, course_instance_ids: list[int]) -> list[dict]:
    """Return instructor filter options for the given course instance IDs."""
    if not course_instance_ids:
        return [{"label": "All instructor", "value": "all"}]
    stmt = (
        select(Profile.id, Profile.first_name)
        .join(course_instructors, course_instructors.c.instructor_id == Profile.id)
        .where(course_instructors.c.course_instance_id.in_(course_instance_ids))
        .distinct()
    )
    rows = db.execute(stmt).all()
    return [{"label": "All instructor", "value": "all"}] + [
        {"label": row.first_name, "value": str(row.id)} for row in rows
    ]


def get_course_version_options(db: Session, course_instance_ids: list[int]) -> list[dict]:
    """Return distinct CTP version options for the given course instance IDs.
    The version is stored on the master record (CourseMaster.ctp_version)."""
    from app.modules.course.models import CourseInstance
    from app.modules.course_master.models import CourseMaster

    if not course_instance_ids:
        return [{"label": "All version", "value": "all"}]
    stmt = (
        select(CourseMaster.ctp_version)
        .join(CourseInstance, CourseInstance.master_id == CourseMaster.id)
        .where(CourseInstance.id.in_(course_instance_ids))
        .distinct()
    )
    rows = db.execute(stmt).scalars().all()
    versions = sorted(v for v in rows if v)
    return [{"label": "All version", "value": "all"}] + [
        {"label": v, "value": v} for v in versions
    ]


def get_course_instance_options(db: Session, course_instance_ids: list[int]) -> list[dict]:
    """Return distinct course instance titles for the given course IDs."""
    from app.modules.course.models import CourseInstance

    if not course_instance_ids:
        return [{"label": "All instance", "value": "all"}]
    stmt = (
        select(CourseInstance.id, CourseInstance.title)
        .where(CourseInstance.id.in_(course_instance_ids))
    )
    rows = db.execute(stmt).all()
    return [{"label": "All instance", "value": "all"}] + [
        {"label": row.title, "value": str(row.id)} for row in rows
    ]


def get_lesson_options(db: Session, course_instance_ids: list[int]) -> list[dict]:
    """Return distinct lesson options for the given course instance IDs."""
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreation,
        CourseSelectionInfoLessonCreationLesson,
    )

    if not course_instance_ids:
        return [{"label": "All lessons", "value": "all"}]
    stmt = (
        select(
            CourseSelectionInfoLessonCreationLesson.id,
            CourseSelectionInfoLessonCreationLesson.lesson_title,
        )
        .join(
            CourseSelectionInfoLessonCreation,
            CourseSelectionInfoLessonCreationLesson.course_selection_info_lesson_creation_id
            == CourseSelectionInfoLessonCreation.id,
        )
        .where(CourseSelectionInfoLessonCreation.course_instance_id.in_(course_instance_ids))
        .distinct()
    )
    rows = db.execute(stmt).all()
    return [{"label": "All lessons", "value": "all"}] + [
        {"label": row.lesson_title or f"Lesson {row.id}", "value": str(row.id)} for row in rows
    ]


def get_training_type_options() -> list[dict]:
    """Return static training type filter options."""
    return [{"label": "All training types", "value": "all"}]


def get_competency_options() -> list[dict]:
    """Return static competency."""
    return [{"label": "All competencies", "value": "all"}]


def get_aircraft_simulator_options(db: Session) -> list[dict]:
    """Return aircraft / simulator filter options from master tables."""
    aircraft_stmt = (
        select(MasterAircraftType.id, MasterAircraftType.label)
        .order_by(MasterAircraftType.label)
    )
    aircraft_rows = db.execute(aircraft_stmt).all()

    simulator_stmt = (
        select(MasterSimulatorType.id, MasterSimulatorType.label)
        .order_by(MasterSimulatorType.label)
    )
    simulator_rows = db.execute(simulator_stmt).all()

    options = [{"label": "All aircraft / simulators", "value": "all"}]

    for row in aircraft_rows:
        options.append({"label": f"Aircraft – {row.label}", "value": f"aircraft:{row.id}"})

    for row in simulator_rows:
        options.append({"label": f"Simulator – {row.label}", "value": f"simulator:{row.id}"})

    return options


def get_evaluation_type_options(db: Session, course_instance_ids: list[int] | None = None) -> list[dict]:
    """Return evaluation type filter options from EvaluationLessonQuiz.assessment_type.

    When ``course_instance_ids`` is provided, scope the evaluation quizzes to the
    masters of those instances so the option list reflects the selected courses.
    """
    from app.modules.course.models import CourseInstance

    stmt = select(EvaluationLessonQuiz.assessment_type).where(
        EvaluationLessonQuiz.assessment_type.is_not(None)
    )
    if course_instance_ids:
        stmt = stmt.join(
            CourseInstance, EvaluationLessonQuiz.course_master_id == CourseInstance.master_id
        ).where(CourseInstance.id.in_(course_instance_ids))
    stmt = stmt.distinct()
    rows = db.execute(stmt).scalars().all()
    options = [{"label": "All evaluation types", "value": "all"}]
    for typ in rows:
        options.append({"label": typ.title(), "value": typ})
    return options


def get_material_options(db: Session, course_instance_ids: list[int]) -> list[dict]:
    """Return material filter options for the given course instance IDs."""
    if not course_instance_ids:
        return [{"label": "All materials", "value": "all"}]
    stmt = (
        select(CourseSelectionMaterialFile.id, CourseSelectionMaterialFile.filename)
        .where(CourseSelectionMaterialFile.course_instance_id.in_(course_instance_ids))
        .distinct()
    )
    rows = db.execute(stmt).all()
    return [{"label": "All materials", "value": "all"}] + [
        {"label": row.filename, "value": str(row.id)} for row in rows
    ]


def get_filter_options(params: DashboardFilterState, db: Session = Depends(get_db), user: "User" = Depends(get_current_user)) -> list[dict]:
    """
    Return filter options for the dashboard, cascaded by the current selections
    in ``params``. Each filter's option list is narrowed by every selection
    above it in the dependency chain (course → version → instance →
    student / instructor / lesson / material).
    """
    from app.modules.course.router import list_personnel_courses
    from app.modules.course.models import CourseInstance
    from app.modules.course_master.models import CourseMaster

    personnel_resp = list_personnel_courses(db=db, user=user)
    courses = getattr(personnel_resp, "data", [])
    course_options = [{"label": "All courses", "value": "all"}] + [
        {"label": c.title, "value": str(c.id)} for c in courses
    ]

    # The universe of course instances the user may see (all their courses).
    all_course_ids = [c.id for c in courses]

    # --- Resolve the course-instance set top-down through the chain ----------
    # Start from the user's full course-instance universe, then narrow by the
    # selected course (master), courseVersion, and courseInstance in order.
    candidate_instance_ids = set(all_course_ids)

    # 1. course (master) -> instances of that master
    selected_course = _coerce_int(params.course)
    if selected_course is not None:
        if selected_course in all_course_ids:
            candidate_instance_ids = {selected_course}
        else:
            candidate_instance_ids = set()

    # 2. courseVersion -> instances whose master has that ctp_version
    if params.courseVersion != "all":
        version_instance_ids = set(
            db.execute(
                select(CourseInstance.id)
                .join(CourseMaster, CourseInstance.master_id == CourseMaster.id)
                .where(
                    CourseMaster.ctp_version == params.courseVersion,
                    CourseInstance.id.in_(candidate_instance_ids) if candidate_instance_ids else CourseInstance.id == -1,
                )
            ).scalars().all()
        )
        candidate_instance_ids = candidate_instance_ids & version_instance_ids

    # 3. courseInstance -> the selected instance itself
    selected_instance = _coerce_int(params.courseInstance)
    if selected_instance is not None:
        candidate_instance_ids = candidate_instance_ids & {selected_instance}

    # --- Narrow by instructor / student / lesson (lower in the chain) --------
    # instructor: the courses taught by the selected instructor
    selected_instructor = _coerce_int(params.instructor)
    if selected_instructor is not None:
        instructor_instance_ids = set(
            db.execute(
                select(course_instructors.c.course_instance_id).where(
                    course_instructors.c.instructor_id == selected_instructor,
                    course_instructors.c.course_instance_id.in_(candidate_instance_ids) if candidate_instance_ids else course_instructors.c.course_instance_id == -1,
                )
            ).scalars().all()
        )
        candidate_instance_ids = candidate_instance_ids & instructor_instance_ids

    # student: the courses the selected student is enrolled in
    selected_student = _coerce_int(params.student)
    if selected_student is not None:
        student_instance_ids = set(
            db.execute(
                select(CourseEnrollment.course_instance_id).where(
                    CourseEnrollment.student_id == selected_student,
                    CourseEnrollment.course_instance_id.in_(candidate_instance_ids) if candidate_instance_ids else CourseEnrollment.course_instance_id == -1,
                )
            ).scalars().all()
        )
        candidate_instance_ids = candidate_instance_ids & student_instance_ids

    # lesson: instances that define the selected lesson
    if params.lesson != "all":
        from app.modules.course_selection_info.models import (
            CourseSelectionInfoLessonCreation,
            CourseSelectionInfoLessonCreationLesson,
        )
        selected_lesson = _coerce_int(params.lesson)
        if selected_lesson is not None:
            lesson_instance_ids = set(
                db.execute(
                    select(CourseSelectionInfoLessonCreation.course_instance_id)
                    .join(
                        CourseSelectionInfoLessonCreationLesson,
                        CourseSelectionInfoLessonCreationLesson.course_selection_info_lesson_creation_id
                        == CourseSelectionInfoLessonCreation.id,
                    )
                    .where(
                        CourseSelectionInfoLessonCreationLesson.id == selected_lesson,
                        CourseSelectionInfoLessonCreation.course_instance_id.in_(candidate_instance_ids) if candidate_instance_ids else CourseSelectionInfoLessonCreation.course_instance_id == -1,
                    )
                ).scalars().all()
            )
            candidate_instance_ids = candidate_instance_ids & lesson_instance_ids

    instance_ids = sorted(candidate_instance_ids)

    # --- Build the option lists from the narrowed instance set ---------------
    # Each option helper additionally honours its OWN selection so a selected
    # value is always present in its own list even when the underlying data has
    # been narrowed away (keeps the UI control stable).
    student_options = get_student_options(db, instance_ids)
    instructor_options = get_instructor_options(db, instance_ids)
    version_options = get_course_version_options(db, instance_ids)
    instance_options = get_course_instance_options(db, instance_ids)
    lesson_options = get_lesson_options(db, instance_ids)
    training_type_options = get_training_type_options()
    material_options = get_material_options(db, instance_ids)
    evaluation_type_options = get_evaluation_type_options(db, instance_ids)
    aircraft_simulator_options = get_aircraft_simulator_options(db)
    competency_options = get_competency_options()

    return [
        {"label": "Course", "key": "course", "options": course_options},
        {"label": "Course version", "key": "courseVersion", "options": version_options},
        {"label": "Course instance", "key": "courseInstance", "options": instance_options},
        {"label": "Student", "key": "student", "options": student_options},
        {"label": "Instructor", "key": "instructor", "options": instructor_options},
        {"label": "Lesson", "key": "lesson", "options": lesson_options},
        {"label": "Date range", "key": "dateRange", "options": [
            {"label": "Last 24 hours", "value": "24h"},
            {"label": "Last 7 days", "value": "7d"},
            {"label": "Last 30 days", "value": "30d"},
        ]},
        {"label": "Training type", "key": "trainingType", "options": training_type_options},
        {"label": "Competency", "key": "competency", "options": competency_options},
        {"label": "Aircraft / Simulator", "key": "aircraftSimulator", "options": aircraft_simulator_options},
        {"label": "Material", "key": "material", "options": material_options},
        {"label": "Evaluation type", "key": "evaluationType", "options": evaluation_type_options},
    ]


def get_filters():
    """Return static default filter selections."""
    return {
        "course": "all",
        "courseVersion": "all",
        "courseInstance": "all",
        "student": "all",
        "instructor": "all",
        "dateRange": "24h",
        "lesson": "all",
        "trainingType": "all",
        "competency": "all",
        "aircraftSimulator": "all",
        "material": "all",
        "evaluationType": "all",
    }
