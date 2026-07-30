"""Shared SQL scoping helpers for dashboard queries."""

from sqlalchemy import func

from app.modules.course.models import CourseInstance, course_instructors
from app.modules.course_master.models import CourseMaster

from .schemas import DashboardFilterState


def apply_course_instance_scope(
    stmt,
    params: DashboardFilterState | None,
    *,
    include_instructor: bool = True,
    master_joined: bool = False,
):
    """Apply AND-combined course, version, instance, and instructor filters.

    ``course`` is the case-insensitive logical course title. Each
    ``CourseMaster`` row represents one version, and each master may own
    multiple delivery instances.
    """
    if not params:
        return stmt
    if (
        params.course != "all" or params.courseVersion != "all"
    ) and not master_joined:
        stmt = stmt.join(
            CourseMaster, CourseInstance.master_id == CourseMaster.id
        )
    if params.course != "all" or params.courseVersion != "all":
        if params.course != "all":
            stmt = stmt.where(
                func.lower(CourseMaster.title) == params.course.casefold()
            )
        if params.courseVersion != "all":
            stmt = stmt.where(
                CourseMaster.ctp_version == params.courseVersion
            )
    if params.courseInstance != "all":
        stmt = stmt.where(CourseInstance.id == int(params.courseInstance))
    if include_instructor and params.instructor != "all":
        stmt = stmt.join(
            course_instructors,
            course_instructors.c.course_instance_id == CourseInstance.id,
        ).where(
            course_instructors.c.instructor_id == int(params.instructor)
        )
    return stmt
