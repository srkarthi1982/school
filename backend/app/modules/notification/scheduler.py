import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import distinct, select, update
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.modules.notification.models import NotificationRecipient, NotificationTemplate

logger = logging.getLogger(__name__)

SCHEDULER_INTERVAL = 60 * 60 * 2 # 2 hrs

TEMPLATE_GETTERS: dict[str, Any] = {}


def register_template_getter(source_module: str, fn: Any) -> None:
    TEMPLATE_GETTERS[source_module] = fn


def register_chat_getter() -> None:
    from uuid import UUID

    async def chat_getter(source_module: str, source_id: str | None, db: Session) -> list[int]:
        if source_module != 'chat' or not source_id:
            return []
        try:
            from app.modules.chat.common.models import ConversationParticipant, Message as ChatMessage
            msg_row = db.execute(
                select(ChatMessage).where(ChatMessage.id == UUID(source_id))
            ).scalar_one_or_none()
            if not msg_row:
                logger.warning("chat_getter: message not found source_id=%s", source_id)
                return []
            conversation_id = msg_row.conversation_id
            rows = db.execute(
                select(ConversationParticipant.user_id).where(
                    ConversationParticipant.conversation_id == conversation_id,
                    ConversationParticipant.user_id != msg_row.sender_id,
                )
            ).all()
            return [r[0] for r in rows]
        except Exception:
            logger.exception("chat_getter error")
            return []

    TEMPLATE_GETTERS['chat'] = chat_getter


register_chat_getter()


async def process_next_notifications(interval_seconds: int = 60) -> None:
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await process_due_notifications()
        except Exception:
            logger.exception("Scheduler: process_due_notifications failed")


async def process_due_notifications() -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        templates = db.execute(
            select(NotificationTemplate).where(
                NotificationTemplate.next_notifications_on.isnot(None),
            )
        ).scalars().all()

        for template in templates:
            raw = template.next_notifications_on
            if not raw:
                continue

            all_times = [datetime.fromisoformat(t.strip()) for t in raw.split(",") if t.strip()]
            due_times = [t for t in all_times if t <= now]
            if not due_times:
                continue

            recipient_rows = db.execute(
                select(distinct(NotificationRecipient.recipient_id)).where(
                    NotificationRecipient.template_id == template.id
                )
            ).scalars().all()
            recipient_ids = list(recipient_rows)

            if not recipient_ids:
                remaining = [t for t in all_times if t > now]
                _update_template_next_notifications(db, template.id, remaining)
                continue

            for due in due_times:
                _persist_scheduled_notification(
                    db, template, recipient_ids,
                )

            remaining = [t for t in all_times if t > now]
            _update_template_next_notifications(db, template.id, remaining)
    except Exception:
        logger.exception("process_due_notifications error")
    finally:
        db.close()


def _persist_scheduled_notification(
    db: Session,
    template: NotificationTemplate,
    recipient_ids: list[int],
) -> None:
    new_rows = [
        NotificationRecipient(
            template_id=template.id,
            recipient_id=rid,
        )
        for rid in recipient_ids
    ]
    if new_rows:
        db.add_all(new_rows)
        db.commit()


def _update_template_next_notifications(db: Session, template_id: int, remaining: list[datetime]) -> None:
    serialized = ",".join(t.isoformat() for t in remaining) if remaining else None
    db.execute(
        update(NotificationTemplate)
        .where(NotificationTemplate.id == template_id)
        .values(next_notifications_on=serialized)
    )
    db.commit()