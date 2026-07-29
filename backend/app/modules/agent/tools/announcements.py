from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select

from app.core.permissions import PermissionCode
from app.modules.agent.context import UserContext
from app.modules.agent.tools.registry import tool
from app.modules.faq.models import Faq
from app.modules.notification.models import NotificationRecipient
from app.modules.term.models import AcademicYear, Semester


@tool(
    name="get_my_notifications",
    description=(
        "The current user's most recent notifications (title, body, link, "
        "read/unread). Use when asked about announcements or 'did I miss "
        "anything'."
    ),
    parameters={
        "type": "object",
        "properties": {
            "unread_only": {"type": "boolean", "description": "Only unread notifications (default false)"},
        },
    },
    status_label="Checking your notifications…",
)
def get_my_notifications(ctx: UserContext, args: dict[str, Any]) -> Any:
    stmt = (
        select(NotificationRecipient)
        .where(NotificationRecipient.recipient_id == ctx.user_id)
        .order_by(NotificationRecipient.created_at.desc())
        .limit(15)
    )
    if args.get("unread_only"):
        stmt = stmt.where(NotificationRecipient.read_at.is_(None))
    rows = ctx.db.execute(stmt).scalars().all()
    return {
        "notifications": [
            {
                "title": r.template.title,
                "body": r.template.body,
                "link": r.template.link,
                "created_at": r.created_at,
                "read": r.read_at is not None,
            }
            for r in rows
        ]
    }


@tool(
    name="search_faq",
    description=(
        "Search the school's official FAQ entries by keyword. Use for policy "
        "and procedure questions before answering from general knowledge."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Keywords to search for"},
        },
        "required": ["query"],
    },
    permission=PermissionCode.FAQ_READ,
    status_label="Searching the FAQ…",
)
def search_faq(ctx: UserContext, args: dict[str, Any]) -> Any:
    words = [w for w in str(args.get("query", "")).split() if len(w) >= 3][:5]
    stmt = select(Faq).limit(10)
    if words:
        stmt = stmt.where(
            or_(*[Faq.question.ilike(f"%{w}%") for w in words] + [Faq.answer.ilike(f"%{w}%") for w in words])
        )
    rows = ctx.db.execute(stmt).scalars().all()
    return {"faqs": [{"question": f.question, "answer": f.answer} for f in rows]}


@tool(
    name="get_academic_calendar",
    description=(
        "The academic calendar: academic years and their semesters with "
        "start/end dates. Use for questions about semester dates and terms."
    ),
    permission=PermissionCode.TERM_READ,
    status_label="Checking the academic calendar…",
)
def get_academic_calendar(ctx: UserContext, args: dict[str, Any]) -> Any:
    years = ctx.db.execute(
        select(AcademicYear).order_by(AcademicYear.start_date.desc()).limit(3)
    ).scalars().all()
    return {
        "academic_years": [
            {
                "name": y.name,
                "start_date": y.start_date,
                "end_date": y.end_date,
                "semesters": [
                    {
                        "name": s.name,
                        "type": s.type,
                        "start_date": s.start_date,
                        "end_date": s.end_date,
                    }
                    for s in y.semesters
                ],
            }
            for y in years
        ]
    }
