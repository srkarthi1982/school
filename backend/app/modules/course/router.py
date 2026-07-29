import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from sqlalchemy import func, literal, select
from sqlalchemy.orm import Session, aliased
from app.modules.attendance.models import Attendance

from app.core.database import get_db
from app.core.deps import get_current_user, has_permission, require_permission, require_role
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.core.schemas import apply_sort, paginate
from app.modules.course_info.models import CourseInfoGeneralInformation
from app.modules.course_master.models import CourseMaster
from app.modules.profile.models import Profile, ProfilePlatform
from app.modules.users.models import User
from app.modules.users.models import Permission, role_permissions, user_roles

from app.modules.course_selection_material.schemas import MaterialResponse
from app.modules.course_selection_material.services import (
    material_modified,
    seed_from_master,
    serialize_material as serialize_instance_material,
)
from app.modules.course_selection_form.schemas import (
    FormBuilderResponse as InstanceFormBuilderResponse,
)
from app.modules.course_selection_form.services import (
    form_modified,
    seed_from_master as seed_form_from_master,
    serialize_form_builder as serialize_instance_form_builder,
)
from app.modules.course_selection_evaluation.schemas import (
    EvaluationResponse as InstanceEvaluationResponse,
)
from app.modules.course_selection_evaluation.services import (
    evaluation_modified,
    seed_from_master as seed_evaluation_from_master,
    serialize_evaluation as serialize_instance_evaluation,
)
from app.modules.course_selection_info.services import course_info_modified
from app.modules.course_selection_currencies_certificate.services import currencies_cert_modified

from .models import (
    CourseEnrollment,
    CourseInstance,
    CourseModificationRequest,
    CourseModificationRequestStatus,
    CourseOtherPersonnel,
    course_instructors,
)
from app.modules.profile.models import Profile
from .guards import ensure_course_not_stopped
from .schemas import (
  CourseCreate,
  CourseExtendRequest,
  CourseModificationRequestCreate,
  CourseModificationRequestDecision,
  CourseModificationRequestResponse,
  CoursePersonnelResponse,
  CourseResponse,
  CourseUpdate,
  MyCourseItemResponse,
  MyScheduleCourseItem,
  OtherPersonnelAdd,
  PersonnelAdd,
  PersonnelCandidate,
  PersonnelMember,
  PersonnelStudentMember,
  StudentProfileResponse,
  LessonResponse,
  AttendanceResponse,
  PersonnelCourseResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/courses", tags=["Courses"])

# ---------------------------------------------------------------------------
# Lessons (filter by CourseInstance id)
# ---------------------------------------------------------------------------

from app.modules.course_selection_info import services as csinfo  # noqa: E402

@router.get(
    "/{course_id}/lessons",
    response_model=SuccessResponse[list[LessonResponse]],
)
def list_lessons_by_course_instance(
    course_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ATTENDANCE_READ)),
):
    """
    Return a list of lessons for the given CourseInstance.
    Each lesson is represented by a minimal dict containing its ``id`` and ``title``.
    """
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    # Retrieve the instance's own lessons (from Lesson Creation tab)
    lessons = csinfo.instance_lessons(course)
    # Serialize a simple representation
    # Use the lesson's title field (lesson_title) for a meaningful name.
    result = [
        {
            "id": lesson.id,
            "title": lesson.lesson_title,
            "lesson_number": lesson.lesson_number,
        }
        for lesson in lessons
    ]
    return ok(result)


def _attach_modified(db: Session, course: CourseInstance) -> CourseInstance:
    """Set transient ``*_modified`` flags (instance content vs master) for the
    response serializer. The diff helpers early-return when a category hasn't been
    seeded yet, so this stays cheap for freshly created courses.
    """
    course.material_modified = material_modified(db, course)
    course.surveys_modified = form_modified(db, course)
    course.evaluation_modified = evaluation_modified(db, course)
    course.course_info_modified = course_info_modified(db, course)
    course.currencies_cert_modified = currencies_cert_modified(db, course)
    return course


# ---------------------------------------------------------------------------
# Courses CRUD
# ---------------------------------------------------------------------------
@router.get("/", response_model=SuccessResponse[list[CourseResponse]])
def list_courses(
    title: str | None = Query(None, description="Partial match on title"),
    course_date: date | None = Query(
        None, description="Exact match on course date"),
    status: str | None = Query(None, description="Exact match on status"),
    master_id: int | None = Query(None, description="Filter by source master"),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_READ)),
):
    query = db.query(CourseInstance)
    if title:
        query = query.filter(CourseInstance.title.ilike(f"%{title}%"))
    if course_date:
        query = query.filter(CourseInstance.course_date == course_date)
    if status:
        query = query.filter(CourseInstance.status == status)
    if master_id:
        query = query.filter(CourseInstance.master_id == master_id)
    query = apply_sort(query, CourseInstance, sort_by, sort_order)
    result = paginate(query, page, page_size)
    for course in result.data:
        _attach_modified(db, course)
    return result


@router.get("/{course_id}", response_model=SuccessResponse[CourseResponse])
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_READ)),
):
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return ok(_attach_modified(db, course))


@router.post("/", response_model=SuccessResponse[CourseResponse], status_code=201)
def create_course(
    data: CourseCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    master = db.get(CourseMaster, data.master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Course master not found")

    payload = data.model_dump()
    if not payload.get("course_date"):
        payload["course_date"] = master.course_date

    course = CourseInstance(
        **payload, created_by_id=user.id, updated_by_id=user.id)
    db.add(course)
    db.commit()
    db.refresh(course)
    return ok(course)


@router.put("/{course_id}", response_model=SuccessResponse[CourseResponse])
def update_course(
    course_id: int,
    data: CourseUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    # TODO: when full approval workflow lands, route non-admin edits through
    # CourseModificationRequest instead of mutating directly. For this pass
    # any caller with course:write may update directly; admins also see
    # modification requests via the approve endpoints below.
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    # A stopped course rejects every edit — including status flips, so the
    # /resume endpoint (which shifts the session schedule) is the only way out.
    ensure_course_not_stopped(db, course_id)
    old_status = course.status
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(course, key, value)
    course.updated_by_id = user.id
    db.commit()

    # On the draft → approved transition, fork the Course Selection (template)
    # schedule into the operational session schedule. Copy is idempotent: it
    # skips when a session schedule already exists, so re-approval never clobbers
    # operational edits (keep/reset is handled via the session /reset endpoint).
    if old_status != "approved" and course.status == "approved":
        from app.modules.course_selection_material.services import (
            approve_library_materials_for_cs,
        )
        from app.modules.course_selection_schedule.services import (
            ensure_schedule_for_instance,
        )
        from app.modules.course_session_schedule.services import (
            copy_selection_to_session,
        )

        ensure_schedule_for_instance(db, course, user.id)
        copy_selection_to_session(db, course)
        approve_library_materials_for_cs(db, course.id)

        # Index this instance's material files for RAG search (fire-and-forget).
        try:
            from app.modules.rag.scheduler import trigger_index_course_instance

            trigger_index_course_instance(course.id)
        except Exception:
            logger.exception("Failed to trigger RAG indexing for course %s", course.id)

    db.refresh(course)
    return ok(course)


@router.post("/{course_id}/extend", response_model=SuccessResponse[CourseResponse])
def extend_course_period(
    course_id: int,
    data: CourseExtendRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    """Extend an approved course's period by pushing its end date out.

    Extensions are cumulative and capped at 20% (floored) of the ORIGINAL
    period in days — the period as it was at approval, before any extension —
    so repeated extensions can never compound past the cap.
    """
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.status.lower() != "approved":
        raise HTTPException(
            status_code=409, detail="Only approved courses can be extended")
    if not course.start_date or not course.end_date:
        raise HTTPException(
            status_code=409, detail="Course has no start/end date to extend")

    extended = course.extended_days or 0
    # Inclusive day count of the original (pre-extension) period. Days the
    # course spent stopped also pushed end_date out — exclude them too so a
    # long stop doesn't inflate the 20% allowance.
    original_days = (
        (course.end_date - course.start_date).days + 1
        - extended
        - (course.stopped_days or 0)
    )
    max_extension = int(original_days * 0.2)
    remaining = max_extension - extended
    if data.additional_days > remaining:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Extension exceeds the allowed maximum. The course period is "
                f"{original_days} days, so at most {max_extension} extension "
                f"day{'s' if max_extension != 1 else ''} are allowed"
                f" ({remaining} remaining)."
            ),
        )

    course.end_date = course.end_date + timedelta(days=data.additional_days)
    course.extended_days = extended + data.additional_days
    course.updated_by_id = user.id
    db.commit()
    db.refresh(course)
    return ok(_attach_modified(db, course))


@router.post("/{course_id}/stop", response_model=SuccessResponse[CourseResponse])
def stop_course(
    course_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    """Temporarily stop an approved course.

    While stopped, every write activity on the course (attendance, grading,
    schedule edits, enrollment changes, edits) is rejected with 409 until the
    course is resumed; viewing stays available. ``stopped_at`` is always
    server-side "today" — it anchors the session-shift gap on resume.
    """
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.status.lower() != "approved":
        raise HTTPException(
            status_code=409, detail="Only approved courses can be stopped")

    course.status = "stopped"
    course.stopped_at = date.today()
    course.updated_by_id = user.id
    db.commit()
    db.refresh(course)
    return ok(_attach_modified(db, course))


@router.post("/{course_id}/resume", response_model=SuccessResponse[CourseResponse])
def resume_course(
    course_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    """Resume a stopped course.

    Session-schedule days pending at the stop shift forward by the stop gap
    (re-landing on available teaching days), the course end date is pushed by
    the same gap, and the course returns to "approved".
    """
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.status.lower() != "stopped" or course.stopped_at is None:
        raise HTTPException(
            status_code=409, detail="Only stopped courses can be resumed")

    gap = (date.today() - course.stopped_at).days  # same-day resume → 0
    if gap > 0:
        from app.modules.course_session_schedule.services import shift_session_days

        shift_session_days(db, course, course.stopped_at, gap, user.id)
        if course.end_date:
            course.end_date = course.end_date + timedelta(days=gap)
        course.stopped_days = (course.stopped_days or 0) + gap

    course.status = "approved"
    course.stopped_at = None
    course.updated_by_id = user.id
    db.commit()
    db.refresh(course)

    # The course dropped out of RAG search while stopped (queries only match
    # approved instances) and its bindings may have been pruned — restore them.
    try:
        from app.modules.rag.scheduler import trigger_index_course_instance

        trigger_index_course_instance(course.id)
    except Exception:
        logger.exception("Failed to trigger RAG indexing for course %s", course.id)

    return ok(_attach_modified(db, course))


@router.delete("/{course_id}", status_code=204)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    ensure_course_not_stopped(db, course_id)
    db.delete(course)
    db.commit()


# ---------------------------------------------------------------------------
# Material (Course Selection → Material category)
# ---------------------------------------------------------------------------
@router.post(
    "/{course_id}/material",
    response_model=SuccessResponse[MaterialResponse],
)
def ensure_course_material(
    course_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.MATERIAL_WRITE)),
):
    """Return the Material view for this course instance, seeding it on first open.

    A course instance gets its *own* material entities, lazily copied from its
    master the first time this endpoint is called (idempotent via
    ``course_instances.material_seeded``). Thereafter the instance's material is
    edited independently of the master.
    """
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    seed_from_master(db, course)
    return ok(serialize_instance_material(db, course))


@router.post(
    "/{course_id}/form-builder",
    response_model=SuccessResponse[InstanceFormBuilderResponse],
)
def ensure_course_form_builder(
    course_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.FORM_BUILDER_WRITE)),
):
    """Return the Form view for this course instance, seeding it on first open.

    The instance gets its own survey/form links, lazily copied from its master
    (idempotent via ``course_instances.surveys_seeded``), then edited
    independently of the master.
    """
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    seed_form_from_master(db, course)
    return ok(serialize_instance_form_builder(course, db))


@router.post(
    "/{course_id}/evaluation",
    response_model=SuccessResponse[InstanceEvaluationResponse],
)
def ensure_course_evaluation(
    course_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.EVALUATION_WRITE)),
):
    """Return the Evaluation view for this course instance, seeding it on first open.

    The instance gets its own lesson↔quiz associations, lazily copied from its
    master (idempotent via ``course_instances.evaluation_seeded``), then edited
    independently of the master.
    """
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    seed_evaluation_from_master(db, course)
    return ok(serialize_instance_evaluation(course, db))


# ---------------------------------------------------------------------------
# Personnel (Course Selection → Personnel category)
# ---------------------------------------------------------------------------
def _member(profile: Profile, role: str | None = None) -> PersonnelMember:
    return PersonnelMember(
        profile_id=profile.id,
        full_name=profile.full_name,
        username=profile.user.username if profile.user else None,
        rank=profile.rank,
        email=profile.email,
        role=role,
        roles=profile.user.role_names if profile.user else [],
    )


def _get_course_or_404(db: Session, course_id: int) -> CourseInstance:
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


# A course only frees its students for another course once it is closed; any
# other status ("draft", "published", …) counts as active for this rule.
CLOSED_COURSE_STATUS = "closed"


def _ensure_not_on_course(course: CourseInstance, profile_id: int) -> None:
    """Each person can hold only one position on a course — student,
    instructor or other."""
    if any(e.student_id == profile_id for e in course.enrollments):
        raise HTTPException(
            status_code=409, detail="Person is already added as a student")
    if any(p.id == profile_id for p in course.instructors):
        raise HTTPException(
            status_code=409, detail="Person is already added as an instructor")
    if any(o.profile_id == profile_id for o in course.other_personnel):
        raise HTTPException(
            status_code=409, detail="Person is already added as other personnel")


def _active_course_elsewhere(
    db: Session, profile_id: int, exclude_course_id: int
) -> CourseInstance | None:
    """Return another non-closed course the student is already enrolled in, or
    ``None``. Enforces the rule: one student → one active course at a time."""
    return (
        db.query(CourseInstance)
        .join(CourseEnrollment, CourseEnrollment.course_instance_id == CourseInstance.id)
        .filter(
            CourseEnrollment.student_id == profile_id,
            CourseInstance.id != exclude_course_id,
            CourseInstance.status != CLOSED_COURSE_STATUS,
        )
        .first()
    )


@router.get(
    "/personnel/candidates",
    response_model=SuccessResponse[list[PersonnelCandidate]],
)
def list_personnel_candidates(
    kind: str = Query("other", pattern="^(student|instructor|other)$"),
    search: str | None = Query(None, description="Partial match on name"),
    course_id: int | None = Query(
        None, description="Current course; scopes the 'other' constraints"),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_READ)),
):
    """Profiles that can be enrolled from one of the Personnel tabs.

    * ``student`` → users granted any ``student:*`` permission.
    * ``instructor`` → users granted any ``teacher:*`` permission.
    * ``other`` → every user, minus those already booked on another non-closed
      course or already a student/instructor on the current course.
    """

    def _has_perm_prefix(prefix: str):
        # Correlated EXISTS: does this User hold any permission whose code
        # starts with ``<prefix>:`` (e.g. "student:read", "teacher:write")?
        return (
            select(literal(1))
            .select_from(
                user_roles
                .join(role_permissions, role_permissions.c.role_id == user_roles.c.role_id)
                .join(Permission, Permission.id == role_permissions.c.permission_id)
            )
            .where(user_roles.c.user_id == User.id)
            .where(Permission.code.like(f"{prefix}:%"))
            .exists()
        )

    query = db.query(Profile).join(User, Profile.user_id == User.id)
    if kind == "student":
        query = query.filter(_has_perm_prefix("student"))
    elif kind == "instructor":
        query = query.filter(_has_perm_prefix("teacher"))
    else:  # "other"
        # 1) Not already added (in any role) to another non-closed course.
        booked_elsewhere = [
            select(CourseEnrollment.student_id)
            .join(CourseInstance, CourseInstance.id == CourseEnrollment.course_instance_id)
            .where(CourseInstance.status != CLOSED_COURSE_STATUS),
            select(course_instructors.c.instructor_id)
            .join(CourseInstance, CourseInstance.id == course_instructors.c.course_instance_id)
            .where(CourseInstance.status != CLOSED_COURSE_STATUS),
            select(CourseOtherPersonnel.profile_id)
            .join(CourseInstance, CourseInstance.id == CourseOtherPersonnel.course_instance_id)
            .where(CourseInstance.status != CLOSED_COURSE_STATUS),
        ]
        if course_id is not None:
            booked_elsewhere = [sq.where(CourseInstance.id != course_id) for sq in booked_elsewhere]
        for sq in booked_elsewhere:
            query = query.filter(Profile.id.notin_(sq))
        # 2) Not already a student or instructor on the current course.
        if course_id is not None:
            query = query.filter(
                Profile.id.notin_(
                    select(CourseEnrollment.student_id)
                    .where(CourseEnrollment.course_instance_id == course_id)
                ),
                Profile.id.notin_(
                    select(course_instructors.c.instructor_id)
                    .where(course_instructors.c.course_instance_id == course_id)
                ),
            )
    if search:
        like = f"%{search}%"
        query = query.filter(
            (Profile.first_name.ilike(like))
            | (Profile.middle_name.ilike(like))
            | (Profile.last_name.ilike(like))
            | (User.username.ilike(like))
        )
    profiles = query.order_by(Profile.first_name).limit(200).all()

    # For students, flag anyone already enrolled in a non-closed course so the
    # picker can grey them out (one student → one active course at a time).
    active_map: dict[int, tuple[int, str]] = {}
    if kind == "student" and profiles:
        rows = (
            db.query(
                CourseEnrollment.student_id,
                CourseInstance.id,
                CourseInstance.title,
            )
            .join(CourseInstance, CourseInstance.id == CourseEnrollment.course_instance_id)
            .filter(
                CourseEnrollment.student_id.in_([p.id for p in profiles]),
                CourseInstance.status != CLOSED_COURSE_STATUS,
            )
            .all()
        )
        for student_id, course_id, title in rows:
            active_map.setdefault(student_id, (course_id, title))

    return ok([
        PersonnelCandidate(
            profile_id=p.id,
            full_name=p.full_name,
            username=p.user.username if p.user else None,
            rank=p.rank,
            email=p.email,
            roles=p.user.role_names if p.user else [],
            active_course_id=active_map.get(p.id, (None, None))[0],
            active_course_title=active_map.get(p.id, (None, None))[1],
        )
        for p in profiles
    ])


@router.get(
    "/{course_id}/personnel",
    response_model=SuccessResponse[CoursePersonnelResponse],
)
def get_course_personnel(
    course_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_READ)),
):
    course = _get_course_or_404(db, course_id)
    # Dedupe students: the enrollment unique key includes enrollment_date, so
    # a student can have several enrollment rows — show each person once.
    seen: set[int] = set()
    students: list[PersonnelMember] = []
    for e in course.enrollments:
        if e.student_id in seen:
            continue
        seen.add(e.student_id)
        students.append(_member(e.student))
    return ok(CoursePersonnelResponse(
        students=students,
        instructors=[_member(p) for p in course.instructors],
        others=[_member(o.profile, role=o.role) for o in course.other_personnel],
    ))

@router.get(
    "/personnel/courses", response_model=SuccessResponse[list[PersonnelCourseResponse]]
)
def list_personnel_courses(
    db: Session = Depends(get_db),
    user: "User" = Depends(get_current_user),
    _=Depends(require_permission(PermissionCode.ATTENDANCE_READ)),
):
    """
    Return distinct courses (id, title) where the current user participates as a
    student, instructor, or other personnel.
    """
    pid = user.profile.id if user.profile else None
    if pid is None:
        return ok([])

    cols = (CourseInstance.id, CourseInstance.title)

    # Student courses
    student_stmt = (
        select(*cols)
        .join(CourseEnrollment, CourseEnrollment.course_instance_id == CourseInstance.id)
        .where(CourseEnrollment.student_id == pid)
    )

    # Instructor courses
    instructor_stmt = (
        select(*cols)
        .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
        .where(course_instructors.c.instructor_id == pid)
    )

    # Other personnel courses
    other_stmt = (
        select(*cols)
        .join(CourseOtherPersonnel, CourseOtherPersonnel.course_instance_id == CourseInstance.id)
        .where(CourseOtherPersonnel.profile_id == pid)
    )

    # Union all three and ensure distinct results
    union_stmt = student_stmt.union(instructor_stmt, other_stmt)
    union_subq = union_stmt.subquery()
    rows = db.execute(
        select(union_subq.c.id, union_subq.c.title).distinct()
    ).all()

    result = [PersonnelCourseResponse(id=r.id, title=r.title) for r in rows]
    return ok(result)

@router.get(
    "/{course_id}/personnel/students",
    response_model=SuccessResponse[list[PersonnelStudentMember]],
)
def list_course_students(
    course_id: int = Path(..., description="Course ID, 0 for all students"),
    user_id: int | None = None,
    attendance_date: date | None = Query(None, description="Filter attendances by date"),
    lesson_id: int | None = Query(None, description="Filter attendances by lesson id"),
    session_placement_id: int | None = Query(
        None, description="Scope attendances to a specific session-schedule placement"
    ),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.ATTENDANCE_READ)),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    """
    Return a paginated list of student personnel members for the given course instance.
    """
    # Ensure the existsget_course_or_404(db, course_id)

    # Build a query selecting distinct student profiles for the course
    if course_id == 0:
        # Return all students across all courses
        query = (
            db.query(Profile)
            .join(CourseEnrollment, CourseEnrollment.student_id == Profile.id)
            .order_by(Profile.id)
            .distinct()
        )
    else:
        query = (
            db.query(Profile)
            .join(CourseEnrollment, CourseEnrollment.student_id == Profile.id)
            .filter(CourseEnrollment.course_instance_id == course_id)
            .order_by(Profile.id)
            .distinct()
        )
    # Optional filter by a specific user (student) ID
    if user_id is not None:
        query = query.filter(Profile.id == user_id)

    # Apply pagination utility
    paginated = paginate(query, page, page_size)

    # Convert Profile objects to PersonnelStudentMember schema, including attendances
    members = []
    for p in paginated.data:
        # Fetch attendance records for the student
        # Build attendance query with optional filters
        attendance_query = db.query(Attendance).filter(Attendance.student_id == p.id)
        if session_placement_id is not None:
            # Per-session scope: the placement uniquely identifies the session, so it
            # supersedes the date/lesson filters.
            attendance_query = attendance_query.filter(
                Attendance.session_placement_id == session_placement_id
            )
        else:
            if attendance_date is not None:
                attendance_query = attendance_query.filter(Attendance.date == attendance_date)
            if lesson_id is not None:
                attendance_query = attendance_query.filter(Attendance.lesson_id == lesson_id)
            else:
                attendance_query = attendance_query.filter(Attendance.lesson_id == None)

        attendance_records = attendance_query.all()
        # Map to AttendanceResponse schema
        attendances = [
            AttendanceResponse(
                id=a.id,
                student_id=a.student_id,
                lesson_id=a.lesson_id,
                date=a.date,
                status_id=a.status_id,
                locked=a.locked,
                level=a.level,
                user_id=a.user_id,
                session_placement_id=a.session_placement_id,
            )
            for a in attendance_records
        ]
        # Build PersonnelStudentMember with attendances and username (mil_no is derived from username)
        member = PersonnelStudentMember(
            id=p.id,
            full_name=p.full_name,
            rank=p.rank,
            username=p.user.username if p.user else None,
            attendances=attendances,
            photo=p.photo,
        )
        members.append(member)

    # Return a Success pagination metadata
    return SuccessResponse(data=members, meta=paginated.meta)


@router.post(
    "/{course_id}/personnel/students",
    response_model=SuccessResponse[CoursePersonnelResponse],
    status_code=201,
)
def add_course_student(
    course_id: int,
    data: PersonnelAdd,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    course = _get_course_or_404(db, course_id)
    ensure_course_not_stopped(db, course_id)
    profile = db.get(Profile, data.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    _ensure_not_on_course(course, data.profile_id)
    active = _active_course_elsewhere(db, data.profile_id, course.id)
    if active is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{profile.full_name} is already enrolled in an active course "
                f"(\"{active.title}\"). A student can only be in one active "
                "course at a time — close that course first."
            ),
        )
    db.add(CourseEnrollment(
        course_instance_id=course.id,
        student_id=data.profile_id,
        enrollment_date=datetime.now(),
        created_by_id=user.id,
        updated_by_id=user.id,
    ))
    db.commit()
    db.refresh(course)
    return get_course_personnel(course_id, db)


@router.delete("/{course_id}/personnel/students/{profile_id}", status_code=204)
def remove_course_student(
    course_id: int,
    profile_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    course = _get_course_or_404(db, course_id)
    ensure_course_not_stopped(db, course_id)
    rows = (
        db.query(CourseEnrollment)
        .filter(
            CourseEnrollment.course_instance_id == course.id,
            CourseEnrollment.student_id == profile_id,
        )
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    for row in rows:
        db.delete(row)
    db.commit()


@router.post(
    "/{course_id}/personnel/instructors",
    response_model=SuccessResponse[CoursePersonnelResponse],
    status_code=201,
)
def add_course_instructor(
    course_id: int,
    data: PersonnelAdd,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    course = _get_course_or_404(db, course_id)
    ensure_course_not_stopped(db, course_id)
    profile = db.get(Profile, data.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    _ensure_not_on_course(course, data.profile_id)
    course.instructors.append(profile)
    db.commit()
    db.refresh(course)
    return get_course_personnel(course_id, db)


@router.delete("/{course_id}/personnel/instructors/{profile_id}", status_code=204)
def remove_course_instructor(
    course_id: int,
    profile_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    course = _get_course_or_404(db, course_id)
    ensure_course_not_stopped(db, course_id)
    target = next((p for p in course.instructors if p.id == profile_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Instructor not found")
    course.instructors.remove(target)
    db.commit()


@router.post(
    "/{course_id}/personnel/others",
    response_model=SuccessResponse[CoursePersonnelResponse],
    status_code=201,
)
def add_course_other(
    course_id: int,
    data: OtherPersonnelAdd,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    course = _get_course_or_404(db, course_id)
    ensure_course_not_stopped(db, course_id)
    profile = db.get(Profile, data.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    _ensure_not_on_course(course, data.profile_id)
    # The role column is non-nullable; the picker was dropped from the UI so
    # new rows store an empty string.
    db.add(CourseOtherPersonnel(
        course_instance_id=course.id,
        profile_id=data.profile_id,
        role=data.role or "",
        created_by_id=user.id,
        updated_by_id=user.id,
    ))
    db.commit()
    db.refresh(course)
    return get_course_personnel(course_id, db)


@router.delete("/{course_id}/personnel/others/{profile_id}", status_code=204)
def remove_course_other(
    course_id: int,
    profile_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    course = _get_course_or_404(db, course_id)
    ensure_course_not_stopped(db, course_id)
    row = next(
        (o for o in course.other_personnel if o.profile_id == profile_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Person not found")
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Modification requests (approval workflow scaffolding)
# ---------------------------------------------------------------------------
@router.get(
    "/{course_id}/modification-requests",
    response_model=SuccessResponse[list[CourseModificationRequestResponse]],
)
def list_modification_requests(
    course_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.COURSE_READ)),
):
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    items = (
        db.query(CourseModificationRequest)
        .filter(CourseModificationRequest.course_id == course_id)
        .order_by(CourseModificationRequest.created_at.desc())
        .all()
    )
    return ok(items)


@router.post(
    "/{course_id}/modification-requests",
    response_model=SuccessResponse[CourseModificationRequestResponse],
    status_code=201,
)
def create_modification_request(
    course_id: int,
    data: CourseModificationRequestCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_WRITE)),
):
    course = db.get(CourseInstance, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    ensure_course_not_stopped(db, course_id)
    req = CourseModificationRequest(
        course_id=course_id,
        requested_by_id=user.id,
        payload=data.payload,
        status=CourseModificationRequestStatus.WAIT_FOR_APPROVAL,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return ok(req)


@router.post(
    "/modification-requests/{request_id}/approve",
    response_model=SuccessResponse[CourseModificationRequestResponse],
)
def approve_modification_request(
    request_id: int,
    data: CourseModificationRequestDecision,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_APPROVE)),
):
    req = db.get(CourseModificationRequest, request_id)
    if not req:
        raise HTTPException(
            status_code=404, detail="Modification request not found")
    if not req.is_open:
        raise HTTPException(status_code=409, detail="Request is not pending")
    ensure_course_not_stopped(db, req.course_id)

    # Apply payload to the course.
    course = req.course
    for key, value in (req.payload or {}).items():
        if hasattr(course, key):
            setattr(course, key, value)
    course.updated_by_id = user.id

    req.status = CourseModificationRequestStatus.APPROVED
    req.decided_by_id = user.id
    req.decided_at = datetime.now()
    req.decision_note = data.decision_note
    db.commit()
    db.refresh(req)
    return ok(req)


@router.post(
    "/modification-requests/{request_id}/reject",
    response_model=SuccessResponse[CourseModificationRequestResponse],
)
def reject_modification_request(
    request_id: int,
    data: CourseModificationRequestDecision,
    db: Session = Depends(get_db),
    user=Depends(require_permission(PermissionCode.COURSE_APPROVE)),
):
    req = db.get(CourseModificationRequest, request_id)
    if not req:
        raise HTTPException(
            status_code=404, detail="Modification request not found")
    if not req.is_open:
        raise HTTPException(status_code=409, detail="Request is not pending")

    req.status = CourseModificationRequestStatus.REJECTED
    req.decided_by_id = user.id
    req.decided_at = datetime.now()
    req.decision_note = data.decision_note
    db.commit()
    db.refresh(req)
    return ok(req)


@router.get("/my/", response_model=SuccessResponse[list[MyCourseItemResponse]])
def list_my_courses(db: Session = Depends(get_db), user: "User" = Depends(require_permission(PermissionCode.ADMIN_FULL, PermissionCode.TEACHER_READ))):

    stmt = (
        select(
            CourseInstance.id,
            literal('').label('code'),
            CourseInstance.title,
            CourseInfoGeneralInformation.course_aim.label('outline'),
            func.count(CourseEnrollment.id).label('students_count')
        )
        .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
        .join(CourseInfoGeneralInformation, CourseInstance.master_id == CourseInfoGeneralInformation.course_master_id)
        .outerjoin(CourseEnrollment, CourseInstance.id == CourseEnrollment.course_instance_id)
    )

    if not has_permission(user, db, PermissionCode.ADMIN_FULL):
        stmt = (
            stmt.where(course_instructors.c.instructor_id == user.profile.id)
        )

    stmt = (
        stmt.group_by(CourseInstance.id, CourseInstance.title,
                      CourseInfoGeneralInformation.course_aim)
        .order_by(CourseInstance.id)
    )

    return ok(db.execute(stmt).all())


@router.get("/my-schedule-courses/", response_model=SuccessResponse[list[MyScheduleCourseItem]])
def list_my_schedule_courses(
    db: Session = Depends(get_db),
    user: "User" = Depends(require_permission(PermissionCode.SCHEDULE_ENTRY_READ)),
):
    """Course instances the current user is a member of — enrolled (student) or
    assigned (instructor) — with their dates, for the Schedule Management course
    picker. Open to both students and teachers (SCHEDULE_ENTRY_READ); distinct
    from the instructor-only ``/my/`` (which omits dates)."""
    pid = user.profile.id if user.profile else None
    if pid is None:
        return ok([])

    cols = (
        CourseInstance.id,
        CourseInstance.title,
        CourseInstance.start_date,
        CourseInstance.end_date,
        CourseInstance.status,
    )
    student_stmt = (
        select(*cols, literal("student").label("role"))
        .join(CourseEnrollment, CourseEnrollment.course_instance_id == CourseInstance.id)
        .where(CourseEnrollment.student_id == pid)
    )
    instructor_stmt = (
        select(*cols, literal("instructor").label("role"))
        .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
        .where(course_instructors.c.instructor_id == pid)
    )
    rows = db.execute(student_stmt.union(instructor_stmt)).all()

    # De-dup by instance id; instructor role wins when the user is both.
    by_id: dict[int, MyScheduleCourseItem] = {}
    for r in rows:
        if r.id not in by_id or r.role == "instructor":
            by_id[r.id] = MyScheduleCourseItem(
                id=r.id,
                title=r.title,
                start_date=r.start_date,
                end_date=r.end_date,
                status=r.status,
                role=r.role,
            )
    return ok(sorted(by_id.values(), key=lambda c: c.id))


@router.get("/{course_id}/students", response_model=SuccessResponse[list[StudentProfileResponse]])
def list_students_by_course(course_id: int,
                            db: Session = Depends(get_db),
                            _=Depends(require_permission(
                                PermissionCode.ADMIN_FULL, PermissionCode.TEACHER_READ))
                            ):
    pltf_subquery = (
        select(
            ProfilePlatform.platform_code
        )
        .where(ProfilePlatform.profile_id == Profile.id)
        .order_by(ProfilePlatform.id.asc())
        .limit(1)
    )
    stmt = (
        select(
            Profile.id,
            User.username,
            func.regexp_replace(
                func.concat(Profile.first_name, ' ',
                            Profile.middle_name, ' ', Profile.last_name),
                r'\s+',
                ' ',
                'g'
            ).label("fullName"),
            Profile.rank,
            Profile.qualification,
            Profile.date_of_birth.label("dateOfBirth"),
            Profile.country,
            Profile.email,
            Profile.mobile_no.label("mobileNo"),
            Profile.ext_no.label("extNo"),
            literal("PRESENT").label("attendanceStatus"),
            pltf_subquery.label("primaryPlatform")
        )
        .select_from(CourseEnrollment)
        .join(Profile, CourseEnrollment.student_id == Profile.id)
        .join(User, Profile.user_id == User.id)
        .where(CourseEnrollment.course_instance_id == course_id)
    )
    return ok(db.execute(stmt).all())


@router.get("/classmates/", response_model=SuccessResponse[list[StudentProfileResponse]])
def list_my_classmates(db: Session = Depends(get_db), user: User = Depends(require_permission(PermissionCode.STUDENT_READ, PermissionCode.ADMIN_FULL))):
    sq_pri_pltf = (
        select(
            ProfilePlatform.platform_code
        )
        .where(ProfilePlatform.profile_id == Profile.id)
        .order_by(ProfilePlatform.id.asc())
        .limit(1)
    )
    student_id = user.profile.id
    ce = aliased(CourseEnrollment)
    sq_exists = (
        select(1)
        .where(ce.student_id == student_id, CourseEnrollment.course_instance_id == ce.course_instance_id)
        .exists()
    )
    stmt = (
        select(
            Profile.id,
            User.username,
            func.regexp_replace(
                func.concat(Profile.first_name, ' ',
                            Profile.middle_name, ' ', Profile.last_name),
                r'\s+',
                ' ',
                'g'
            ).label("fullName"),
            Profile.rank,
            Profile.qualification,
            Profile.date_of_birth.label("dateOfBirth"),
            Profile.country,
            Profile.email,
            Profile.mobile_no.label("mobileNo"),
            Profile.ext_no.label("extNo"),
            literal("PRESENT").label("attendanceStatus"),
            sq_pri_pltf.label("primaryPlatform")
        )
        .select_from(CourseEnrollment)
        .join(Profile, CourseEnrollment.student_id == Profile.id)
        .join(User, Profile.user_id == User.id)

    )

    if not has_permission(user, db, PermissionCode.ADMIN_FULL):
        stmt = stmt.where(sq_exists, CourseEnrollment.student_id != student_id)

    return ok(db.execute(stmt).all())
