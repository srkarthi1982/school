from __future__ import annotations
import logging

from typing import Any, List
from anyio import to_thread
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func, desc, case

from app.core.response import SuccessResponse, Meta
from app.modules.notification.host_integration import (
    get_current_user,
    get_db,
    resolve_websocket_user,
    normalize_user_id,
)
from app.modules.notification.schemas import (
    MarkAllReadResponse,
    NotificationResponse,
    UnreadCountResponse,
    SummaryNotificationResponse,
)
from app.modules.notification.services import (
    list_notifications,
    manager,
    mark_all_read,
    mark_all_read_by_module,
    mark_read,
    unread_count,
    _build_notification_response,
)
from app.modules.notification.models import NotificationTemplate, NotificationRecipient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notification", tags=["Notification"])


@router.get("/", response_model=SuccessResponse[list[NotificationResponse]])
def list_my_notifications(
    only_unread: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return list_notifications(
        db, current_user.id, page=page, page_size=page_size, only_unread=only_unread
    )


@router.get("/unread-count", response_model=SuccessResponse[UnreadCountResponse])
def get_unread_count(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    count = unread_count(db, current_user.id)
    return SuccessResponse(data=UnreadCountResponse(count=count))


@router.patch("/{notification_id}/read", response_model=SuccessResponse[NotificationResponse])
def mark_one_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = mark_read(db, current_user.id, notification_id)
    return SuccessResponse(data=NotificationResponse.model_validate(_build_notification_response(row)))


@router.post("/mark-all-read", response_model=SuccessResponse[MarkAllReadResponse])
def mark_all(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    count = mark_all_read(db, current_user.id)
    return SuccessResponse(data=MarkAllReadResponse(count=count))


@router.post("/by-module/{source_module}/mark-all-read", response_model=SuccessResponse[MarkAllReadResponse])
def mark_all_by_module(
    source_module: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    logger.info(f"[notification] mark_all_by_module called: source_module=%s, user_id=%s", source_module, current_user.id)
    count = mark_all_read_by_module(db, current_user.id, source_module)
    logger.info(f"[notification] mark_all_by_module result: count=%s", count)
    return SuccessResponse(data=MarkAllReadResponse(count=count))


def _extract_websocket_token(websocket: WebSocket) -> str | None:
    query_token = websocket.query_params.get("token")
    if query_token:
        return query_token

    authorization = websocket.headers.get("authorization")
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip() or None

    return None


@router.websocket("/ws")
async def notifications_websocket(websocket: WebSocket) -> None:
    token = _extract_websocket_token(websocket)
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db_gen = get_db()
    try:
        db = next(db_gen)
        user = await to_thread.run_sync(lambda: resolve_websocket_user(token, db))
    except Exception:
        logger.exception("notification ws: auth/user-resolution failed")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass

    user_id = user.id

    await manager.connect(user_id, websocket)
    try:
        initial_unread = await to_thread.run_sync(lambda: unread_count(db, user_id))
    except Exception:
        logger.exception("notification ws: unread_count failed for user_id=%s", user_id)
        initial_unread = 0

    await manager.send_to_socket(
        websocket,
        {
            "type": "connection.ready",
            "user_id": user_id,
            "unread_count": initial_unread,
        },
    )

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")

            if event_type == "read":
                raw_id = data.get("id")
                if not raw_id:
                    continue
                try:
                    notification_id = int(raw_id)
                except (ValueError, TypeError):
                    continue
                try:
                    await to_thread.run_sync(
                        lambda: mark_read(db, user_id, notification_id)
                    )
                except Exception:
                    logger.exception("notification ws: mark_read failed")
                    continue
                await manager.send_to_socket(
                    websocket,
                    {"type": "notification.read", "id": notification_id},
                )
            elif event_type == "mark_all_read":
                try:
                    count = await to_thread.run_sync(
                        lambda: mark_all_read(db, user_id)
                    )
                except Exception:
                    logger.exception("notification ws: mark_all_read failed")
                    continue
                await manager.send_to_socket(
                    websocket,
                    {"type": "notification.all_read", "count": count},
                )
            elif event_type == "mark_all_read_by_module":
                source_module = data.get("source_module")
                if not source_module:
                    continue
                try:
                    count = await to_thread.run_sync(
                        lambda: mark_all_read_by_module(db, user_id, source_module)
                    )
                except Exception:
                    logger.exception("notification ws: mark_all_read_by_module failed")
                    continue
                await manager.send_to_socket(
                    websocket,
                    {"type": "notification.all_read_by_module", "source_module": source_module, "count": count},
                )
            else:
                await manager.send_to_socket(
                    websocket,
                    {"type": "error", "message": f"Unsupported event type: {event_type}"},
                )
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception:
        logger.exception("notification ws: unexpected error for user_id=%s", user_id)
        manager.disconnect(user_id, websocket)
        try:
            await websocket.close()
        except Exception:
            pass


def get_notification_summary(db: Session, recipient_id: Any, only_unread: bool) -> SuccessResponse[List[SummaryNotificationResponse]]:
    normalized = normalize_user_id(recipient_id)

    window_expr = func.row_number().over(
        partition_by=NotificationTemplate.source_module,
        order_by=NotificationRecipient.created_at.desc()
    ).label("rn")

    latest_recipients = (
        db.query(NotificationRecipient)
        .join(NotificationTemplate)
        .filter(NotificationRecipient.recipient_id == normalized)
        .add_columns(window_expr)
        .subquery()
    )

    latest_ids = db.scalars(
        select(latest_recipients.c.id).where(latest_recipients.c.rn == 1)
    ).all()

    latest_rows = (
        db.query(NotificationRecipient)
        .join(NotificationTemplate)
        .filter(NotificationRecipient.id.in_(latest_ids))
        .all()
    )

    latest_data = [_build_notification_response(r) for r in latest_rows]

    stats_stmt = (
        select(
            NotificationTemplate.source_module,
            func.count(NotificationRecipient.id).label("total_count"),
            func.sum(case((NotificationRecipient.read_at.is_(None), 1), else_=0)).label("unread_count")
        )
        .join(NotificationRecipient, NotificationRecipient.template_id == NotificationTemplate.id)
        .where(NotificationRecipient.recipient_id == normalized)
        .group_by(NotificationTemplate.source_module)
    )

    stats_rows = db.execute(stats_stmt).all()
    summary_map = {
        row.source_module: {"total_count": row.total_count, "unread_count": row.unread_count}
        for row in stats_rows
    }

    return SuccessResponse(
        data=[
            SummaryNotificationResponse(
                notification=item,
                total_count=summary_map.get(item["source_module"], {}).get("total_count", 0),
                unread_count=summary_map.get(item["source_module"], {}).get("unread_count", 0)
            )
            for item in latest_data
        ]
    )


@router.get("/summary", response_model=SuccessResponse[List[SummaryNotificationResponse]])
def get_notification_summary_endpoint(
    only_unread: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_notification_summary(db, current_user.id, only_unread)


def list_notifications_by_module(
    db: Session,
    recipient_id: Any,
    source_module: str,
    *,
    page: int,
    page_size: int,
    only_unread: bool = False,
) -> SuccessResponse:
    normalized = normalize_user_id(recipient_id)

    query = (
        db.query(NotificationRecipient)
        .join(NotificationTemplate)
        .filter(
            NotificationRecipient.recipient_id == normalized,
            NotificationTemplate.source_module == source_module
        )
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


@router.get("/by-module/{source_module}", response_model=SuccessResponse[list[NotificationResponse]])
def list_notifications_by_module_endpoint(
    source_module: str,
    only_unread: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return list_notifications_by_module(
        db, current_user.id, source_module, page=page, page_size=page_size, only_unread=only_unread
    )


__all__ = ["router"]