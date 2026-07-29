from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select

from app.core.permissions import PermissionCode
from app.modules.agent.context import UserContext
from app.modules.agent.tools.registry import ToolError, tool
from app.modules.course.models import CourseEnrollment, CourseInstance, course_instructors


def accessible_course_ids(ctx: UserContext) -> list[int] | None:
    """Course-instance ids this user may see, or None meaning "all".

    This is the single access-scoping rule shared by every course-shaped tool
    (and, later, by RAG retrieval as its pre-filter): enrolled courses +
    courses taught, or everything for users holding course:read / admin:full.
    """
    if ctx.has_permission(PermissionCode.COURSE_READ.value, PermissionCode.ADMIN_FULL.value):
        return None
    if ctx.profile_id is None:
        return []
    rows = ctx.db.execute(
        select(CourseInstance.id)
        .outerjoin(CourseEnrollment, CourseEnrollment.course_instance_id == CourseInstance.id)
        .outerjoin(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
        .where(
            or_(
                CourseEnrollment.student_id == ctx.profile_id,
                course_instructors.c.instructor_id == ctx.profile_id,
            )
        )
        .distinct()
    )
    return [row[0] for row in rows]


def require_course_access(ctx: UserContext, course_id: int) -> CourseInstance:
    course = ctx.db.get(CourseInstance, course_id)
    if course is None:
        raise ToolError(f"Course {course_id} not found.")
    allowed = accessible_course_ids(ctx)
    if allowed is not None and course_id not in allowed:
        raise ToolError("You do not have access to this course.")
    return course


def _course_summary(course: CourseInstance, relation: str | None = None) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": course.id,
        "title": course.title,
        "status": course.status,
        "start_date": course.start_date,
        "end_date": course.end_date,
        "class_time": course.class_time,
        "location": course.location,
    }
    if relation:
        data["my_relation"] = relation
    return data


@tool(
    name="list_my_courses",
    description=(
        "List the courses the current user is involved in: courses they are "
        "enrolled in as a student and courses they teach as an instructor. "
        "Returns course id, title, status, dates, class time and location. "
        "Use the returned course id with other course tools."
    ),
    permission=PermissionCode.ENROLLMENT_READ,
    status_label="Looking up your courses…",
)
def list_my_courses(ctx: UserContext, args: dict[str, Any]) -> Any:
    if ctx.profile_id is None:
        return {"courses": [], "note": "No profile linked to this account."}

    enrolled = ctx.db.execute(
        select(CourseInstance)
        .join(CourseEnrollment, CourseEnrollment.course_instance_id == CourseInstance.id)
        .where(CourseEnrollment.student_id == ctx.profile_id)
    ).scalars().unique().all()
    teaching = ctx.db.execute(
        select(CourseInstance)
        .join(course_instructors, course_instructors.c.course_instance_id == CourseInstance.id)
        .where(course_instructors.c.instructor_id == ctx.profile_id)
    ).scalars().unique().all()

    courses = [_course_summary(c, "enrolled") for c in enrolled]
    courses += [_course_summary(c, "instructor") for c in teaching if c.id not in {e.id for e in enrolled}]
    return {"courses": courses}


@tool(
    name="get_course_lessons",
    description=(
        "List the lessons of one course (lesson number, title, location, "
        "instructor/student ratio). Only works for courses the user can "
        "access. Requires a course id from list_my_courses."
    ),
    parameters={
        "type": "object",
        "properties": {
            "course_id": {"type": "integer", "description": "Course instance id"},
        },
        "required": ["course_id"],
    },
    permission=PermissionCode.COURSE_INFO_READ,
    status_label="Looking up course lessons…",
)
def get_course_lessons(ctx: UserContext, args: dict[str, Any]) -> Any:
    from app.modules.course_selection_info.models import CourseSelectionInfoLessonCreation

    course = require_course_access(ctx, int(args["course_id"]))
    creation = ctx.db.execute(
        select(CourseSelectionInfoLessonCreation).where(
            CourseSelectionInfoLessonCreation.course_instance_id == course.id
        )
    ).scalar_one_or_none()
    if creation is None or not creation.lessons:
        return {"course": course.title, "lessons": []}
    return {
        "course": course.title,
        "lessons": [
            {
                "id": lesson.id,
                "number": lesson.lesson_number,
                "title": lesson.lesson_title,
                "location": lesson.location,
                "instructor_student_ratio": lesson.instructor_student_ratio,
            }
            for lesson in creation.lessons
        ],
    }


@tool(
    name="list_course_materials",
    description=(
        "List the material files of one course (filename, type, size, and the "
        "lesson they belong to, if any). Only works for courses the user can "
        "access. Requires a course id from list_my_courses."
    ),
    parameters={
        "type": "object",
        "properties": {
            "course_id": {"type": "integer", "description": "Course instance id"},
        },
        "required": ["course_id"],
    },
    permission=PermissionCode.MATERIAL_READ,
    status_label="Looking up course materials…",
)
def list_course_materials(ctx: UserContext, args: dict[str, Any]) -> Any:
    from app.modules.course_selection_material.models import CourseSelectionMaterialFile

    course = require_course_access(ctx, int(args["course_id"]))
    files = ctx.db.execute(
        select(CourseSelectionMaterialFile).where(
            CourseSelectionMaterialFile.course_instance_id == course.id
        )
    ).scalars().all()
    return {
        "course": course.title,
        "materials": [
            {
                "filename": f.filename,
                "content_type": f.content_type,
                "file_size": f.file_size,
                "lesson_id": f.lesson_id,
            }
            for f in files
        ],
    }
