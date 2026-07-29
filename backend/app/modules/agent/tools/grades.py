from __future__ import annotations

from typing import Any

from sqlalchemy import func, select

from app.core.permissions import PermissionCode
from app.modules.agent.context import UserContext
from app.modules.agent.tools.registry import tool
from app.modules.attendance.models import Attendance
from app.modules.attendance_status.models import AttendanceStatus
from app.modules.course.models import CourseInstance
from app.modules.grading.models import GradingProgress


@tool(
    name="get_my_grades",
    description=(
        "The current user's own grading progress per course (graded vs total "
        "items per grading type: quiz, survey, form, flight pack). Answers "
        "'what are my grades / how am I doing'. Only ever returns the asking "
        "user's own records."
    ),
    permission=PermissionCode.ENROLLMENT_READ,
    status_label="Looking up your grades…",
)
def get_my_grades(ctx: UserContext, args: dict[str, Any]) -> Any:
    rows = ctx.db.execute(
        select(GradingProgress, CourseInstance.title)
        .join(CourseInstance, CourseInstance.id == GradingProgress.course_id)
        .where(GradingProgress.student_id == ctx.user_id)
        .order_by(GradingProgress.course_id)
    ).all()
    return {
        "grading_progress": [
            {
                "course": title,
                "type": gp.grading_type,
                "graded": gp.graded_count,
                "total": gp.total_count,
            }
            for gp, title in rows
        ]
    }


@tool(
    name="get_my_attendance",
    description=(
        "The current user's own attendance summary: counts per attendance "
        "status (present, absent, etc.) and the most recent records. Only "
        "ever returns the asking user's own records."
    ),
    permission=PermissionCode.ATTENDANCE_READ,
    status_label="Looking up your attendance…",
)
def get_my_attendance(ctx: UserContext, args: dict[str, Any]) -> Any:
    counts = ctx.db.execute(
        select(AttendanceStatus.name, func.count(Attendance.id))
        .join(Attendance, Attendance.status_id == AttendanceStatus.id)
        .where(Attendance.student_id == ctx.user_id)
        .group_by(AttendanceStatus.name)
    ).all()
    recent = ctx.db.execute(
        select(Attendance)
        .where(Attendance.student_id == ctx.user_id)
        .order_by(Attendance.date.desc())
        .limit(10)
    ).scalars().all()
    return {
        "summary": {name: count for name, count in counts},
        "recent": [
            {"date": a.date, "lesson_id": a.lesson_id, "status_id": a.status_id}
            for a in recent
        ],
    }
