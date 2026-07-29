from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from pathlib import Path
from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.modules.chat.common.schemas import (
    AttachmentResponse,
    ConversationDetailResponse,
    ClearConversationResponse,
    ConversationSummaryResponse,
    DeleteConversationResponse,
    CreateAgentConversationRequest,
    CreateDirectConversationRequest,
    CreateMessageRequest,
    MessageListResponse,
    MessageResponse,
    ReadConversationResponse,
    ReadPayload,
    SendMessagePayload,
    SetReactionRequest,
    SubscribePayload,
    TypingPayload,
    UnsubscribePayload,
    UserReference,
    UserSearchResponse,
)
from app.modules.chat.common.services import (
    agent_user_reference,
    can_access_attachment,
    clear_conversation,
    create_message,
    delete_conversation,
    ensure_agent_conversation,
    ensure_direct_conversation,
    get_conversation_detail,
    get_conversation_for_user,
    get_partner_user_ids,
    list_conversations,
    list_messages,
    manager,
    mark_conversation_read,
    save_uploaded_file,
    search_agents,
    search_users,
    serialize_message_for_user,
    serialize_user_reference,
    set_reaction,
    delete_message,
)
from app.modules.chat.host_integration import get_current_user, get_current_user_for_file, get_db, resolve_websocket_user
from app.modules.chat.common.models import ChatMessageAttachment
from app.core.config import settings
from anyio import to_thread
from app.modules.notification.services import notify_users_and_push

router = APIRouter(prefix="/chat", tags=["chat-common"])


def _maybe_trigger_agent(db: Session, conversation_id: UUID, user_id: Any, message_id: UUID) -> None:
    """Fire-and-forget the agent run when a user messages an agent conversation.

    Called after create_message committed, so the agent's own session sees the
    trigger message. Import is local to avoid a circular chat↔agent import.
    """
    from app.modules.chat.common.models import ChatConversation

    conversation = db.get(ChatConversation, conversation_id)
    if conversation is None or conversation.agent_id is None or conversation.kind not in ("agent", "agent_doc"):
        return

    from app.modules.agent.service import agent_service

    asyncio.create_task(
        agent_service.handle_message(conversation_id, conversation.agent_id, user_id, message_id)
    )


@router.get("/me", response_model=UserReference)
def me(current_user=Depends(get_current_user)) -> UserReference:
    return serialize_user_reference(current_user)


@router.get("/users/search", response_model=UserSearchResponse)
def user_search(
    q: str = Query(default="", max_length=255),
    role: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> UserSearchResponse:
    users = search_users(db, current_user, q, limit, role=role)
    items = [serialize_user_reference(user) for user in users]
    # Agents show up alongside users so chatting with AskMAI feels native.
    # They are skipped when a role filter is set — agents have no roles.
    if role is None or not role.strip():
        items = [agent_user_reference(agent) for agent in search_agents(db, q)] + items
    return UserSearchResponse(items=items[:limit])


@router.get("/conversations", response_model=list[ConversationSummaryResponse])
async def get_conversations(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[ConversationSummaryResponse]:
    return list_conversations(db, current_user.id)


@router.post("/conversations/direct", response_model=ConversationDetailResponse)
async def create_or_get_conversation(
    payload: CreateDirectConversationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ConversationDetailResponse:
    conversation = ensure_direct_conversation(db, current_user.id, payload.participant_id)
    return get_conversation_detail(db, conversation.id, current_user.id)


@router.post("/conversations/agent", response_model=ConversationDetailResponse)
async def create_or_get_agent_conversation(
    payload: CreateAgentConversationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ConversationDetailResponse:
    if payload.library_material_id is not None and payload.material_file_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at most one of library_material_id / material_file_id",
        )
    context_type = context_id = None
    if payload.library_material_id is not None:
        context_type, context_id = "library", str(payload.library_material_id)
    elif payload.material_file_id is not None:
        context_type, context_id = "course_material", str(payload.material_file_id)
    conversation = ensure_agent_conversation(
        db, current_user.id, payload.agent_id, context_type=context_type, context_id=context_id
    )
    return get_conversation_detail(db, conversation.id, current_user.id)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ConversationDetailResponse:
    return get_conversation_detail(db, conversation_id, current_user.id)


@router.get("/conversations/{conversation_id}/messages", response_model=MessageListResponse)
async def get_conversation_messages(
    conversation_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> MessageListResponse:
    return list_messages(db, conversation_id, current_user.id, limit, offset)


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse)
async def post_message(
    conversation_id: UUID,
    payload: CreateMessageRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> MessageResponse:
    message, participant_ids = create_message(
        db, conversation_id, current_user.id, payload.content, list(payload.attachment_ids), payload.reply_to_id
    )
    for participant_id in participant_ids:
        personalized_message = serialize_message_for_user(message, participant_id)
        await manager.send_to_user(
            participant_id,
            {
                "type": "message.created",
                "conversation_id": str(conversation_id),
                "message": personalized_message.model_dump(mode="json"),
            },
        )
    _maybe_trigger_agent(db, conversation_id, current_user.id, message.id)

    sender_full_name = getattr(current_user, "full_name", None) or getattr(current_user, "username", "Someone")

    # Only notify recipients who are NOT actively in this conversation. A recipient
    # with the thread open (subscribed to the room) already sees the message live,
    # so pushing a notification for every reply would be redundant noise.
    recipients = [
        pid
        for pid in participant_ids
        if pid != current_user.id and not manager.is_user_in_room(conversation_id, pid)
    ]

    # sample of next notification
    #now = datetime.now(timezone.utc)
    #next_times = [now + timedelta(minutes=1), now + timedelta(minutes=2)]

    #fire and forget push notification
    await notify_users_and_push(
        recipients,
        type="chat.new_message",
        source_module="chat",
        source_id=str(message.id),
        link="/communication-reporting/chat",
        title=f"New message from {sender_full_name}",
        body=payload.content[:140],
        payload={
            "conversation_id": str(conversation_id),
            "message_id": str(message.id),
            "sender_id": current_user.id,
            "preview": payload.content[:140],
        },
        #next_notification_times=next_times,
    )
    
    return serialize_message_for_user(message, current_user.id)


@router.delete("/conversations/{conversation_id}/messages/{message_id}", response_model=MessageResponse)
async def delete_message_endpoint(
    conversation_id: UUID,
    message_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> MessageResponse:
    message, participant_ids = delete_message(db, message_id, current_user.id)
    serialized = serialize_message_for_user(message, current_user.id)
    await manager.broadcast_to_room(
        conversation_id,
        {
            "type": "message.deleted",
            "conversation_id": str(conversation_id),
            "message_id": str(message_id),
            "deleted_at": message.deleted_at.isoformat(),
        },
    )
    return serialized


@router.post(
    "/conversations/{conversation_id}/messages/{message_id}/reactions",
    response_model=MessageResponse,
)
async def react_to_message(
    conversation_id: UUID,
    message_id: UUID,
    payload: SetReactionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> MessageResponse:
    message, participant_ids = set_reaction(db, message_id, current_user.id, payload.emoji)
    # Reactions carry a personalized `mine` flag, so — like message.created —
    # each participant receives their own serialization of the updated message.
    for participant_id in participant_ids:
        personalized_message = serialize_message_for_user(message, participant_id)
        await manager.send_to_user(
            participant_id,
            {
                "type": "message.reaction",
                "conversation_id": str(conversation_id),
                "message_id": str(message_id),
                "reactions": [r.model_dump(mode="json") for r in personalized_message.reactions],
            },
        )
    return serialize_message_for_user(message, current_user.id)


@router.post("/conversations/{conversation_id}/read", response_model=ReadConversationResponse)
async def read_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ReadConversationResponse:
    read_at, participant_ids = mark_conversation_read(db, conversation_id, current_user.id)
    await manager.broadcast_to_users(
        participant_ids,
        {
            "type": "conversation.read",
            "conversation_id": str(conversation_id),
            "user_id": current_user.id,
            "read_at": read_at.isoformat(),
        },
    )
    return ReadConversationResponse(conversation_id=conversation_id, read_at=read_at)


@router.post("/conversations/{conversation_id}/clear", response_model=ClearConversationResponse)
async def clear_conversation_endpoint(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ClearConversationResponse:
    cleared_at = clear_conversation(db, conversation_id, current_user.id)
    # Notify only the current user's own sessions so other tabs/devices clear too.
    # The other participant is intentionally not notified: their history is unaffected.
    await manager.send_to_user(
        current_user.id,
        {
            "type": "conversation.cleared",
            "conversation_id": str(conversation_id),
            "cleared_at": cleared_at.isoformat(),
        },
    )
    return ClearConversationResponse(conversation_id=conversation_id, cleared_at=cleared_at)


@router.delete("/conversations/{conversation_id}", response_model=DeleteConversationResponse)
async def delete_conversation_endpoint(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> DeleteConversationResponse:
    deleted_at = delete_conversation(db, conversation_id, current_user.id)
    # Notify only the current user's own sessions so other tabs/devices drop the
    # conversation too. The other participant keeps their conversation and history.
    await manager.send_to_user(
        current_user.id,
        {
            "type": "conversation.deleted",
            "conversation_id": str(conversation_id),
            "deleted_at": deleted_at.isoformat(),
        },
    )
    return DeleteConversationResponse(conversation_id=conversation_id, deleted_at=deleted_at)


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

@router.post("/attachments", response_model=AttachmentResponse)
async def upload_attachment(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> AttachmentResponse:
    file_bytes = await file.read()
    storage_path, thumbnail_path = await to_thread.run_sync(
        save_uploaded_file, file_bytes, file.filename or "unnamed", file.content_type or "application/octet-stream"
    )

    attachment = ChatMessageAttachment(
        uploader_id=current_user.id,
        filename=file.filename or "unnamed",
        content_type=file.content_type or "application/octet-stream",
        file_size=len(file_bytes),
        storage_path=str(storage_path.relative_to(settings.PRIVATE_UPLOAD_DIR)),
        thumbnail_path=str(thumbnail_path.relative_to(settings.PRIVATE_UPLOAD_DIR)) if thumbnail_path else None,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return AttachmentResponse(
        id=attachment.id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        file_size=attachment.file_size,
        has_thumbnail=attachment.thumbnail_path is not None,
    )


@router.get("/attachments/{attachment_id}")
async def download_attachment(
    attachment_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_for_file),
):
    attachment = db.get(ChatMessageAttachment, attachment_id)
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    if not can_access_attachment(db, attachment, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    file_path = settings.PRIVATE_UPLOAD_DIR / attachment.storage_path
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    return FileResponse(
        path=str(file_path),
        filename=attachment.filename,
        media_type=attachment.content_type,
    )


@router.get("/attachments/{attachment_id}/thumbnail")
async def download_thumbnail(
    attachment_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_for_file),
):
    attachment = db.get(ChatMessageAttachment, attachment_id)
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    if not can_access_attachment(db, attachment, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if not attachment.thumbnail_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thumbnail not available")

    thumb_path = settings.PRIVATE_UPLOAD_DIR / attachment.thumbnail_path
    if not thumb_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thumbnail not found on disk")

    return FileResponse(
        path=str(thumb_path),
        media_type="image/jpeg",
    )


def _extract_websocket_token(websocket: WebSocket) -> str | None:
    query_token = websocket.query_params.get("token")
    if query_token:
        return query_token

    authorization = websocket.headers.get("authorization")
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip() or None

    return None


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    token = _extract_websocket_token(websocket)
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db_gen = get_db()
    db: Session | None = None
    user_id: int | None = None
    partner_ids: list[Any] = []

    try:
        db = next(db_gen)
        user = await to_thread.run_sync(lambda: resolve_websocket_user(token, db))
    except Exception:
        logger.exception("chat ws: auth/user-resolution failed")
        try:
            next(db_gen)
        except StopIteration:
            pass
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = user.id

    try:
        partner_ids = await to_thread.run_sync(get_partner_user_ids, db, user_id)

        await manager.connect(user_id, websocket)

        if partner_ids:
            await manager.broadcast_to_users(
                partner_ids,
                {
                    "type": "presence.online",
                    "user_id": user_id,
                },
            )
            for partner_id in partner_ids:
                if manager.is_user_online(partner_id):
                    try:
                        await manager.send_to_socket(
                            websocket,
                            {
                                "type": "presence.online",
                                "user_id": partner_id,
                            },
                        )
                    except Exception:
                        continue

        await manager.send_to_socket(
            websocket,
            {
                "type": "connection.ready",
                "user_id": user_id,
                "username": user.username,
                "full_name": user.full_name,
                "display_name": user.full_name,
                "roles": user.role_names,
                "auth_provider": user.auth_provider if user.auth_provider else None,
            },
        )

        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")

            if event_type == "subscribe":
                payload = SubscribePayload.model_validate(data)
                await to_thread.run_sync(get_conversation_for_user, db, payload.conversation_id, user_id)
                manager.subscribe(websocket, payload.conversation_id)
                await manager.send_to_socket(
                    websocket,
                    {
                        "type": "conversation.subscribed",
                        "conversation_id": str(payload.conversation_id),
                    },
                )
            elif event_type == "unsubscribe":
                payload = UnsubscribePayload.model_validate(data)
                manager.unsubscribe(websocket, payload.conversation_id)
                await manager.send_to_socket(
                    websocket,
                    {
                        "type": "conversation.unsubscribed",
                        "conversation_id": str(payload.conversation_id),
                    },
                )
            elif event_type == "message":
                payload = SendMessagePayload.model_validate(data)
                message, participant_ids = create_message(
                    db, payload.conversation_id, user_id, payload.content, list(payload.attachment_ids), payload.reply_to_id
                )
                for participant_id in participant_ids:
                    personalized_message = serialize_message_for_user(message, participant_id)
                    await manager.send_to_user(
                        participant_id,
                        {
                            "type": "message.created",
                            "conversation_id": str(payload.conversation_id),
                            "message": personalized_message.model_dump(mode="json"),
                        },
                    )
                _maybe_trigger_agent(db, payload.conversation_id, user_id, message.id)

            elif event_type == "typing":
                payload = TypingPayload.model_validate(data)
                get_conversation_for_user(db, payload.conversation_id, user_id)
                await manager.broadcast_to_room(
                    payload.conversation_id,
                    {
                        "type": "conversation.typing",
                        "conversation_id": str(payload.conversation_id),
                        "user_id": user_id,
                        "is_typing": payload.is_typing,
                    },
                    exclude=websocket,
                )
            elif event_type == "read":
                payload = ReadPayload.model_validate(data)
                read_at, participant_ids = mark_conversation_read(db, payload.conversation_id, user_id)
                await manager.broadcast_to_users(
                    participant_ids,
                    {
                        "type": "conversation.read",
                        "conversation_id": str(payload.conversation_id),
                        "user_id": user_id,
                        "read_at": read_at.isoformat(),
                    },
                )
            else:
                await manager.send_to_socket(
                    websocket,
                    {
                        "type": "error",
                        "detail": "Unsupported websocket event.",
                    },
                )
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("chat ws: handler crashed for user %s", user_id)
        try:
            await manager.send_to_socket(websocket, {"type": "error", "detail": str(exc)})
        except Exception:
            pass
        try:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        except Exception:
            pass
    finally:
        if user_id is not None:
            fully_disconnected = manager.disconnect(user_id, websocket)
            if fully_disconnected and partner_ids:
                try:
                    await manager.broadcast_to_users(
                        partner_ids,
                        {
                            "type": "presence.offline",
                            "user_id": user_id,
                        },
                    )
                except Exception:
                    pass
        if db is not None:
            try:
                next(db_gen)
            except StopIteration:
                pass
