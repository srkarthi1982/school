from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from app.core.permissions import PermissionCode
from app.modules.agent.context import UserContext
from app.modules.agent.tools.courses import accessible_course_ids
from app.modules.agent.tools.registry import tool
from app.modules.course.models import CourseInstance
from app.modules.schedule_entry.models import ScheduleEntry


@tool(
    name="get_my_schedule",
    description=(
        "The current user's schedule for the next days: personal calendar "
        "entries plus the running/upcoming courses they are involved in "
        "(with start/end dates and class time). Defaults to the next 14 days."
    ),
    parameters={
        "type": "object",
        "properties": {
            "days_ahead": {
                "type": "integer",
                "description": "How many days ahead to look (1-60, default 14)",
            },
        },
    },
    permission=PermissionCode.SCHEDULE_ENTRY_READ,
    status_label="Checking your schedule…",
)
def get_my_schedule(ctx: UserContext, args: dict[str, Any]) -> Any:
    days = min(max(int(args.get("days_ahead") or 14), 1), 60)
    now = datetime.now(timezone.utc)
    until = now + timedelta(days=days)

    entries = ctx.db.execute(
        select(ScheduleEntry)
        .where(
            ScheduleEntry.user_id == ctx.user_id,
            ScheduleEntry.start_at < until,
            ScheduleEntry.end_at > now,
        )
        .order_by(ScheduleEntry.start_at)
    ).scalars().all()

    course_ids = accessible_course_ids(ctx)
    courses: list[CourseInstance] = []
    if course_ids != []:  # [] = user has no courses; None = all (admins get none listed here)
        stmt = select(CourseInstance).where(
            CourseInstance.start_date.is_not(None),
            CourseInstance.start_date <= until.date(),
            CourseInstance.end_date >= now.date(),
        )
        if course_ids is not None:
            stmt = stmt.where(CourseInstance.id.in_(course_ids))
            courses = ctx.db.execute(stmt).scalars().all()

    return {
        "from": now.date(),
        "to": until.date(),
        "personal_entries": [
            {
                "title": e.title,
                "start_at": e.start_at,
                "end_at": e.end_at,
                "description": e.description,
                "importance": e.importance,
            }
            for e in entries
        ],
        "active_courses": [
            {
                "id": c.id,
                "title": c.title,
                "start_date": c.start_date,
                "end_date": c.end_date,
                "class_time": c.class_time,
                "location": c.location,
            }
            for c in courses
        ],
    }
