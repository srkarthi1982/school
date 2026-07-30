from fastapi import Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.modules.course_info.models import MasterAircraftType, MasterSimulatorType
from app.modules.course_selection_material.models import CourseSelectionMaterialFile
from app.modules.evaluation.models import EvaluationLessonQuiz
from app.modules.profile.models import Profile
from app.modules.course.models import CourseEnrollment, CourseInstance, course_instructors
# Imported lazily inside get_filter_options to avoid circular imports
from app.core.database import get_db
from app.core.deps import get_current_user
from .schemas import DashboardFilterState
from .query import apply_course_instance_scope


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
        .order_by(Profile.first_name.asc().nulls_last(), Profile.id.asc())
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
        .order_by(Profile.first_name.asc().nulls_last(), Profile.id.asc())
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
        .order_by(CourseMaster.ctp_version.asc().nulls_last())
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
        .order_by(CourseInstance.title.asc().nulls_last(), CourseInstance.id.asc())
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
        .order_by(
            CourseSelectionInfoLessonCreationLesson.lesson_title.asc().nulls_last(),
            CourseSelectionInfoLessonCreationLesson.id.asc(),
        )
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
    stmt = stmt.distinct().order_by(EvaluationLessonQuiz.assessment_type.asc())
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
        .order_by(
            CourseSelectionMaterialFile.filename.asc().nulls_last(),
            CourseSelectionMaterialFile.id.asc(),
        )
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
    visible_instance_ids = [c.id for c in courses]
    visible_courses = db.execute(
        select(CourseMaster.title)
        .join(CourseInstance, CourseInstance.master_id == CourseMaster.id)
        .where(
            CourseInstance.id.in_(visible_instance_ids)
            if visible_instance_ids
            else CourseInstance.id == -1
        )
        .distinct()
        .order_by(CourseMaster.title.asc().nulls_last())
    ).scalars().all()
    course_options = [{"label": "All courses", "value": "all"}] + [
        {"label": title, "value": title} for title in visible_courses
    ]

    # The universe of course instances the user may see (all their courses).
    all_course_ids = visible_instance_ids

    # --- Resolve the course-instance set top-down through the chain ----------
    # Start from the user's full course-instance universe, then narrow by the
    # selected course (master), courseVersion, and courseInstance in order.
    hierarchy_stmt = select(CourseInstance.id).where(
        CourseInstance.id.in_(all_course_ids)
        if all_course_ids
        else CourseInstance.id == -1
    )
    hierarchy_stmt = apply_course_instance_scope(
        hierarchy_stmt, params, include_instructor=False
    )
    candidate_instance_ids = set(
        db.execute(hierarchy_stmt.order_by(CourseInstance.id)).scalars().all()
    )

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
    material_options = get_material_options(db, instance_ids)
    evaluation_type_options = get_evaluation_type_options(db, instance_ids)

    # Identity filters are informational on self-service dashboards. Never
    # advertise another identity that the server will not authorize.
    if params.report_type == "student" and params.student != "all":
        student_options = [
            option
            for option in student_options
            if option["value"] == params.student
        ]
    if params.report_type == "instructor" and params.instructor != "all":
        instructor_options = [
            option
            for option in instructor_options
            if option["value"] == params.instructor
        ]

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
