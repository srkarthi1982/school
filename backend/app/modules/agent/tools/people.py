from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.core.permissions import PermissionCode
from app.modules.agent.context import UserContext
from app.modules.agent.tools.courses import require_course_access
from app.modules.agent.tools.registry import tool
from app.modules.course.models import CourseEnrollment
from app.modules.profile.models import Profile


@tool(
    name="list_course_people",
    description=(
        "List the people of one course: its instructors and enrolled "
        "students (name, rank, email). Only works for courses the user can "
        "access — this is how questions like 'who teaches my course' or "
        "'who are my classmates' must be answered. Requires a course id from "
        "list_my_courses."
    ),
    parameters={
        "type": "object",
        "properties": {
            "course_id": {"type": "integer", "description": "Course instance id"},
        },
        "required": ["course_id"],
    },
    permission=PermissionCode.STUDENT_READ,
    status_label="Looking up course members…",
)
def list_course_people(ctx: UserContext, args: dict[str, Any]) -> Any:
    course = require_course_access(ctx, int(args["course_id"]))

    def person(profile: Profile) -> dict[str, Any]:
        return {"name": profile.full_name, "rank": profile.rank, "email": profile.email}

    students = ctx.db.execute(
        select(Profile)
        .join(CourseEnrollment, CourseEnrollment.student_id == Profile.id)
        .where(CourseEnrollment.course_instance_id == course.id)
    ).scalars().unique().all()

    return {
        "course": course.title,
        "instructors": [person(p) for p in course.instructors],
        "students": [person(p) for p in students],
    }
