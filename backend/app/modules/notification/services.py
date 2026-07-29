from __future__ import annotations

import logging
import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from anyio import to_thread
from fastapi import HTTPException, WebSocket, status
from sqlalchemy import desc, func, select, update
from sqlalchemy.orm import Session

from app.core.response import Meta, SuccessResponse
from app.modules.notification.host_integration import User, normalize_user_id
from app.modules.notification.models import NotificationTemplate, NotificationRecipient
from app.modules.notification.schemas import NotificationResponse, NotificationTemplateResponse
from app.modules.users.models import Role, user_roles
from app.core.database import SessionLocal

logger = logging.getLogger(__name__)


class NotificationManager:
    """User-level WebSocket connection registry for notifications.

    Tracks all live sockets per user (multi-tab/device aware). Push API
    sends to every socket of a user. No room/group concept — that's chat's job.
    """

    def __init__(self) -> None:
        self._user_connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: Any, websocket: WebSocket) -> None:
        await websocket.accept()
        key = str(user_id)
        self._user_connections[key].add(websocket)

    def disconnect(self, user_id: Any, websocket: WebSocket) -> None:
        key = str(user_id)
        if websocket in self._user_connections.get(key, set()):
            self._user_connections[key].discard(websocket)
            if not self._user_connections[key]:
                self._user_connections.pop(key, None)

    async def send_to_socket(self, websocket: WebSocket, payload: dict[str, Any]) -> None:
        await websocket.send_json(payload)

    async def send_to_user(self, user_id: Any, payload: dict[str, Any]) -> None:
        key = str(user_id)
        connections = self._user_connections.get(key, set())
        for websocket in list(connections):
            try:
                await websocket.send_json(payload)
            except Exception as e:
                logger.exception(f"[send_to_user] failed to send to user_id=%s: %s", user_id, e)

    async def broadcast_to_users(self, user_ids: list[Any], payload: dict[str, Any]) -> None:
        delivered: set[int] = set()
        for user_id in user_ids:
            key = str(user_id)
            for websocket in list(self._user_connections.get(key, set())):
                ws_id = id(websocket)
                if ws_id in delivered:
                    continue
                try:
                    await websocket.send_json(payload)
                    delivered.add(ws_id)
                except Exception:
                    continue

    def is_user_online(self, user_id: Any) -> bool:
        return bool(self._user_connections.get(str(user_id)))


manager = NotificationManager()


def _build_notification_response(recipient: NotificationRecipient, template: NotificationTemplate | None = None) -> dict[str, Any]:
    if template is None:
        template = recipient.template
    return {
        "id": recipient.id,
        "template_id": template.id,
        "recipient_id": recipient.recipient_id,
        "type": template.type,
        "title": template.title,
        "body": template.body,
        "payload": template.payload,
        "source_module": template.source_module,
        "source_id": template.source_id,
        "link": template.link,
        "read_at": recipient.read_at,
        "created_at": recipient.created_at,
        "updated_at": recipient.updated_at,
    }


def _serialize(recipient: NotificationRecipient) -> dict[str, Any]:
    return NotificationResponse.model_validate(_build_notification_response(recipient)).model_dump(mode="json")


def notify_user(
    db: Session,
    recipient_id: Any,
    *,
    type: str,
    source_module: str,
    payload: dict[str, Any] | None = None,
    title: str | None = None,
    body: str | None = None,
    source_id: str | None = None,
    link: str | None = None,
    persist: bool = True,
) -> NotificationRecipient | None:
    """Persist a single notification (no live push).

    Caller in async context should use :func:`notify_users_and_push` to also
    deliver via WebSocket. Pure-sync callers without an event loop may call
    this directly; the recipient will see the unread count on next WS connect.
    """
    if not persist:
        return None
    rows = notify_users(
        db,
        [recipient_id],
        type=type,
        source_module=source_module,
        payload=payload,
        title=title,
        body=body,
        source_id=source_id,
        link=link,
    )
    return rows[0] if rows else None


def notify_users(
    db: Session,
    recipient_ids: list[Any],
    *,
    type: str,
    source_module: str,
    payload: dict[str, Any] | None = None,
    title: str | None = None,
    body: str | None = None,
    source_id: str | None = None,
    link: str | None = None,
    next_notification_times: list[datetime] | None = None,
) -> list[NotificationRecipient]:
    """Bulk persist notifications. Single commit for all recipients.

    Creates one NotificationTemplate and one NotificationRecipient per recipient.
    """
    if not recipient_ids:
        return []

    next_notifications_on_serialized = (
        ",".join(t.isoformat() for t in next_notification_times)
        if next_notification_times else None
    )

    template = NotificationTemplate(
        type=type,
        title=title,
        body=body,
        payload=payload,
        source_module=source_module,
        source_id=source_id,
        link=link,
        next_notifications_on=next_notifications_on_serialized,
    )
    db.add(template)
    db.flush()

    rows = [
        NotificationRecipient(
            template_id=template.id,
            recipient_id=normalize_user_id(rid),
        )
        for rid in recipient_ids
    ]
    db.add_all(rows)
    db.commit()
    for row in rows:
        db.refresh(row)

    return rows


def notify_role(
    db: Session,
    role_name: str,
    *,
    type: str,
    source_module: str,
    payload: dict[str, Any] | None = None,
    title: str | None = None,
    body: str | None = None,
    source_id: str | None = None,
    link: str | None = None,
) -> list[NotificationRecipient]:
    """Notify all users that have the given role."""
    user_ids = db.execute(
        select(User.id)
        .join(user_roles, user_roles.c.user_id == User.id)
        .join(Role, Role.id == user_roles.c.role_id)
        .where(Role.name == role_name)
    ).scalars().all()
    return notify_users(
        db,
        list(user_ids),
        type=type,
        source_module=source_module,
        payload=payload,
        title=title,
        body=body,
        source_id=source_id,
        link=link,
    )


async def notify_users_and_push(
    recipient_ids: list[Any],
    *,
    type: str,
    source_module: str,
    payload: dict[str, Any] | None = None,
    title: str | None = None,
    body: str | None = None,
    source_id: str | None = None,
    link: str | None = None,
    next_notification_times: list[datetime] | None = None,

) -> None:
    async def _persist_and_push() -> None:
        db = SessionLocal()
        try:
            rows = await asyncio.to_thread(
                lambda: notify_users(
                    db, recipient_ids, type=type, source_module=source_module,
                    payload=payload, title=title, body=body, source_id=source_id,
                    link=link, next_notification_times=next_notification_times,
                )
            )

            async def _push_one(recipient: NotificationRecipient) -> None:
                try:
                    notification_payload = _serialize(recipient)
                    await manager.send_to_user(
                        recipient.recipient_id,
                        {"type": "notification.new", "notification": notification_payload},
                    )
                except Exception:
                    logger.exception("Failed to push to user_id=%s", recipient.recipient_id)

            await asyncio.gather(*[_push_one(row) for row in rows])
        except Exception:
            logger.exception("Background notification task failed")
        finally:
            db.close()

    task = asyncio.create_task(_persist_and_push())
    task.add_done_callback(
        lambda t: t.exception() and logger.exception("Notification task failed", exc_info=t.exception())
    )


def list_notifications(
    db: Session,
    recipient_id: Any,
    *,
    page: int,
    page_size: int,
    only_unread: bool = False,
) -> SuccessResponse:
    normalized = normalize_user_id(recipient_id)
    query = (
        db.query(NotificationRecipient)
        .join(NotificationTemplate)
        .filter(NotificationRecipient.recipient_id == normalized)
    )
    if only_unread:
        query = query.filter(NotificationRecipient.read_at.is_(None))
    query = query.order_by(desc(NotificationRecipient.created_at))
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    pages = max(1, (total + page_size - 1) // page_size)
    return SuccessResponse(
        data=[NotificationResponse.model_validate(_build_notification_response(item)) for item in items],
        meta=Meta(page=page, page_size=page_size, total=total, pages=pages),
    )


def unread_count(db: Session, recipient_id: Any) -> int:
    normalized = normalize_user_id(recipient_id)
    result = db.execute(
        select(func.count(NotificationRecipient.id))
        .where(NotificationRecipient.recipient_id == normalized)
        .where(NotificationRecipient.read_at.is_(None))
    ).scalar_one()
    return int(result or 0)


def mark_read(db: Session, recipient_id: Any, notification_id: int) -> NotificationRecipient:
    normalized = normalize_user_id(recipient_id)
    row = db.execute(
        select(NotificationRecipient)
        .where(NotificationRecipient.id == notification_id)
        .where(NotificationRecipient.recipient_id == normalized)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    if row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)
    return row


def mark_all_read(db: Session, recipient_id: Any) -> int:
    normalized = normalize_user_id(recipient_id)
    now = datetime.now(timezone.utc)
    result = db.execute(
        update(NotificationRecipient)
        .where(NotificationRecipient.recipient_id == normalized)
        .where(NotificationRecipient.read_at.is_(None))
        .values(read_at=now)
    )
    db.commit()
    return int(result.rowcount or 0)


def mark_all_read_by_module(db: Session, recipient_id: Any, source_module: str) -> int:
    normalized = normalize_user_id(recipient_id)
    now = datetime.now(timezone.utc)
    result = db.execute(
        update(NotificationRecipient)
        .where(NotificationRecipient.recipient_id == normalized)
        .where(NotificationRecipient.read_at.is_(None))
        .where(NotificationRecipient.template.has(NotificationTemplate.source_module == source_module))
        .values(read_at=now)
    )
    db.commit()
    return int(result.rowcount or 0)


__all__ = [
    "NotificationManager",
    "manager",
    "notify_user",
    "notify_users",
    "notify_role",
    "notify_users_and_push",
    "list_notifications",
    "unread_count",
    "mark_read",
    "mark_all_read",
]