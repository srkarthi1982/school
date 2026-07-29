from __future__ import annotations
from collections import defaultdict
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4
from fastapi import HTTPException, WebSocket, status
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.orm import selectinload, Session

import filetype
from PIL import Image

from app.core.config import settings
from app.modules.chat.common.models import (
    ChatConversation,
    ChatConversationParticipant,
    ChatMessage,
    ChatMessageAttachment,
    ChatMessageReaction,
)
from app.modules.chat.common.schemas import (
    AgentReference,
    AttachmentResponse,
    ConversationDetailResponse,
    ConversationSummaryResponse,
    MessageListResponse,
    MessageResponse,
    MessageSender,
    ReactionGroup,
    RepliedMessagePreview,
    UserReference,
)
from app.modules.agent.models import Agent
from app.modules.chat.host_integration import User, normalize_user_id, resolve_websocket_user

# Ensure upload dir exists
settings.PRIVATE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class WebSocketManager:
    def __init__(self) -> None:
        self._user_connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._room_connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._socket_rooms: dict[WebSocket, set[UUID]] = defaultdict(set)

    async def connect(self, user_id: Any, websocket: WebSocket) -> None:
        await websocket.accept()
        self._user_connections[str(user_id)].add(websocket)

    def disconnect(self, user_id: Any, websocket: WebSocket) -> bool:
        key = str(user_id)
        fully_disconnected = False
        if websocket in self._user_connections.get(key, set()):
            self._user_connections[key].discard(websocket)
            if not self._user_connections[key]:
                self._user_connections.pop(key, None)
                fully_disconnected = True

        rooms = self._socket_rooms.pop(websocket, set())
        for room_id in rooms:
            self._room_connections.get(room_id, set()).discard(websocket)
            if not self._room_connections.get(room_id):
                self._room_connections.pop(room_id, None)

        return fully_disconnected

    def subscribe(self, websocket: WebSocket, conversation_id: UUID) -> None:
        self._room_connections[conversation_id].add(websocket)
        self._socket_rooms[websocket].add(conversation_id)

    def unsubscribe(self, websocket: WebSocket, conversation_id: UUID) -> None:
        self._room_connections.get(conversation_id, set()).discard(websocket)
        if not self._room_connections.get(conversation_id):
            self._room_connections.pop(conversation_id, None)
        self._socket_rooms.get(websocket, set()).discard(conversation_id)

    async def send_to_socket(self, websocket: WebSocket, payload: dict[str, Any]) -> None:
        await websocket.send_json(payload)

    async def send_to_user(self, user_id: Any, payload: dict[str, Any]) -> None:
        key = str(user_id)
        for websocket in list(self._user_connections.get(key, set())):
            try:
                await websocket.send_json(payload)
            except Exception:
                continue

    async def broadcast_to_users(self, user_ids: list[Any], payload: dict[str, Any]) -> None:
        delivered_to: set[int] = set()
        for user_id in user_ids:
            key = str(user_id)
            for websocket in list(self._user_connections.get(key, set())):
                ws_id = id(websocket)
                if ws_id in delivered_to:
                    continue
                try:
                    await websocket.send_json(payload)
                    delivered_to.add(ws_id)
                except Exception:
                    continue

    async def broadcast_to_room(self, conversation_id: UUID, payload: dict[str, Any], exclude: WebSocket | None = None) -> None:
        for websocket in list(self._room_connections.get(conversation_id, set())):
            if exclude is not None and websocket is exclude:
                continue
            try:
                await websocket.send_json(payload)
            except Exception:
                continue

    def is_user_online(self, user_id: Any) -> bool:
        return bool(self._user_connections.get(str(user_id)))

    def is_user_in_room(self, conversation_id: UUID, user_id: Any) -> bool:
        """True if any of the user's live sockets is subscribed to the conversation.

        Used to suppress push notifications for a recipient who currently has the
        conversation open (they see incoming messages in real time already).
        """
        user_sockets = self._user_connections.get(str(user_id))
        if not user_sockets:
            return False
        room_sockets = self._room_connections.get(conversation_id)
        if not room_sockets:
            return False
        return not room_sockets.isdisjoint(user_sockets)


manager = WebSocketManager()


def build_direct_key(user_a_id: Any, user_b_id: Any) -> str:
    first, second = sorted([str(user_a_id), str(user_b_id)])
    return f"{first}:{second}"


def get_user_by_id(db: Session, user_id: Any) -> User | None:
    normalized = normalize_user_id(user_id)
    result = db.execute(select(User).where(User.id == normalized).limit(1))
    return result.scalar_one_or_none()


def get_user_by_id_or_404(db: Session, user_id: Any) -> User:
    user = get_user_by_id(db, user_id)
    if user is None or not bool(getattr(user, "is_active", True)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def serialize_user_reference(user: Any) -> UserReference:
    user_profile = getattr(user, "profile", None)
    photo = None
    if user_profile and getattr(user_profile, "photo", None):
        photo = user_profile.photo
        avatar_url = f"data:image/png;base64,{photo}"
    else:
        avatar_url = None
    return UserReference(
        id=getattr(user, "id"),
        email=getattr(user, "email", None),
        username=getattr(user, "username", str(getattr(user, "id"))),
        full_name=getattr(user, "full_name", getattr(user, "username", str(getattr(user, "id")))),
        display_name=getattr(user, "full_name", getattr(user, "username", str(getattr(user, "id")))),
        roles=getattr(user, "role_names", []),
        auth_provider=getattr(user, "auth_provider", None),
        is_online=manager.is_user_online(getattr(user, "id")),
        is_active=bool(getattr(user, "is_active", True)),
        avatar_url=avatar_url,
    )


def agent_user_reference(agent: Agent) -> UserReference:
    """Present an AI agent alongside users in search results. Agents are not
    users — id stays None and agent_id carries the identity."""
    return UserReference(
        id=None,
        username=agent.slug,
        full_name=agent.display_name,
        display_name=agent.display_name,
        roles=[],
        is_online=True,
        is_active=agent.is_active,
        is_agent=True,
        agent_id=agent.id,
    )


def search_agents(db: Session, search: str) -> list[Agent]:
    stmt = select(Agent).where(Agent.is_active.is_(True))
    if search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(or_(Agent.display_name.ilike(pattern), Agent.slug.ilike(pattern)))
    return list(db.execute(stmt.order_by(Agent.display_name)).scalars().all())


def is_plain_student(permission_codes: set[str]) -> bool:
    """True when the user holds student:read/write but no admin:* or teacher:*
    permission — the case that gets a classmate-only chat directory."""
    if any(code.startswith("admin:") for code in permission_codes):
        return False
    if any(code.startswith("teacher:") for code in permission_codes):
        return False
    return "student:read" in permission_codes or "student:write" in permission_codes


def classmate_only_profile_filter(db: Session, current_user: Any):
    """If ``current_user`` is a plain student, return a SQLAlchemy predicate that
    keeps only profiles co-enrolled in the same course instance(s); otherwise
    return None (i.e. no restriction — full directory)."""
    from app.core.deps import get_user_permission_codes
    from app.modules.course.models import CourseEnrollment
    from app.modules.profile.models import Profile

    if not is_plain_student(get_user_permission_codes(current_user, db)):
        return None

    profile_id = current_user.profile.id if current_user.profile else None
    my_course_ids = select(CourseEnrollment.course_instance_id).where(
        CourseEnrollment.student_id == profile_id
    )
    classmate_profile_ids = select(CourseEnrollment.student_id).where(
        CourseEnrollment.course_instance_id.in_(my_course_ids)
    )
    return Profile.id.in_(classmate_profile_ids)


def search_users(db: Session, current_user: Any, search: str, limit: int, role: str | None = None) -> list[Any]:
    from app.modules.users.models import Role
    from app.modules.profile.models import Profile

    normalized_current = normalize_user_id(current_user.id)
    filters = [User.id != normalized_current, User.is_active.is_(True)]
    stmt = select(User).join(User.profile).options(selectinload(User.profile))

    # Plain students may only find classmates (users co-enrolled in the same
    # course instance). Everyone else keeps the full directory.
    classmate_filter = classmate_only_profile_filter(db, current_user)
    if classmate_filter is not None:
        filters.append(classmate_filter)

    if role is not None and role.strip():
        stmt = stmt.join(User.roles)
        filters.append(Role.name == role.strip())
    if search.strip():
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                Profile.first_name.ilike(pattern),
                Profile.middle_name.ilike(pattern),
                Profile.last_name.ilike(pattern),
                User.username.ilike(pattern),
                Profile.email.ilike(pattern),
            )
        )
    result = db.execute(
        stmt
        .where(and_(*filters))
        .order_by(Profile.first_name, Profile.last_name, User.username)
        .limit(limit)
    )
    return list(result.scalars().all())


def _participant_reference(user: Any) -> UserReference:
    return serialize_user_reference(user)


def _get_existing_direct_conversation(db: Session, direct_key: str) -> ChatConversation | None:
    result = db.execute(
        select(ChatConversation)
        .options(selectinload(ChatConversation.participants).selectinload(ChatConversationParticipant.user))
        .where(ChatConversation.direct_key == direct_key)
    )
    return result.scalar_one_or_none()


def _unhide_for_user(db: Session, conversation: ChatConversation, normalized_user_id: Any) -> None:
    """Deliberately reopening a deleted conversation brings it back into the list."""
    participant = next(
        (p for p in conversation.participants if p.user_id == normalized_user_id), None
    )
    if participant is not None and participant.hidden_at is not None:
        participant.hidden_at = None
        db.commit()


def _fetch_conversation_with_participants(db: Session, conversation_id: UUID) -> ChatConversation:
    result = db.execute(
        select(ChatConversation)
        .options(selectinload(ChatConversation.participants).selectinload(ChatConversationParticipant.user))
        .where(ChatConversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


def get_conversation_for_user(db: Session, conversation_id: UUID, current_user_id: Any) -> ChatConversation:
    normalized_current = normalize_user_id(current_user_id)
    conversation = _fetch_conversation_with_participants(db, conversation_id)
    if not any(participant.user_id == normalized_current for participant in conversation.participants):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Conversation access denied")
    return conversation


def ensure_direct_conversation(db: Session, current_user_id: Any, participant_id: Any) -> ChatConversation:
    normalized_current = normalize_user_id(current_user_id)
    normalized_participant = normalize_user_id(participant_id)

    if normalized_current == normalized_participant:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot start a conversation with yourself")

    get_user_by_id_or_404(db, normalized_current)
    get_user_by_id_or_404(db, normalized_participant)

    direct_key = build_direct_key(normalized_current, normalized_participant)
    existing = _get_existing_direct_conversation(db, direct_key)
    if existing is not None:
        _unhide_for_user(db, existing, normalized_current)
        return existing

    now = datetime.now(timezone.utc)
    conversation = ChatConversation(
        kind="direct",
        direct_key=direct_key,
        created_by_id=normalized_current,
        last_message_at=now,
    )
    db.add(conversation)
    db.flush()

    db.add_all([
        ChatConversationParticipant(conversation_id=conversation.id, user_id=normalized_current),
        ChatConversationParticipant(conversation_id=conversation.id, user_id=normalized_participant),
    ])
    db.commit()
    return _fetch_conversation_with_participants(db, conversation.id)


def build_agent_direct_key(agent_id: Any, user_id: Any) -> str:
    return f"agent:{agent_id}:{user_id}"


def build_agent_doc_direct_key(agent_id: Any, user_id: Any, context_type: str, context_id: str) -> str:
    """One conversation per (user, agent, document)."""
    return f"agent:{agent_id}:{user_id}:doc:{context_type}:{context_id}"


DOC_CONTEXT_LIBRARY = "library"
DOC_CONTEXT_COURSE_MATERIAL = "course_material"


def _validate_document_context(db: Session, user, context_type: str, context_id: str) -> str:
    """Check the user may view the document; return its title.

    Reuses the exact visibility rules of the pages that open these documents.
    Imports are local: chat must not import library/agent modules at import
    time (agent.service imports this module).
    """
    if context_type == DOC_CONTEXT_LIBRARY:
        from app.core.deps import get_user_permission_codes
        from app.modules.library.models import LibraryMaterial
        from app.modules.library.router import _can_view

        try:
            material = db.get(LibraryMaterial, int(context_id))
        except (TypeError, ValueError):
            material = None
        if material is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        perms = get_user_permission_codes(user, db)
        if not _can_view(material, user.full_name, perms):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this document")
        return material.title or material.file_name or "Document"

    if context_type == DOC_CONTEXT_COURSE_MATERIAL:
        import uuid as _uuid

        from app.modules.agent.context import build_user_context
        from app.modules.agent.tools.courses import accessible_course_ids
        from app.modules.course_selection_material.models import CourseSelectionMaterialFile

        try:
            file = db.get(CourseSelectionMaterialFile, _uuid.UUID(context_id))
        except (TypeError, ValueError):
            file = None
        if file is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        allowed = accessible_course_ids(build_user_context(db, user))
        if allowed is not None and file.course_instance_id not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this document")
        return file.filename or "Document"

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown document type")


def ensure_agent_conversation(
    db: Session,
    current_user_id: Any,
    agent_id: Any,
    context_type: str | None = None,
    context_id: str | None = None,
) -> ChatConversation:
    """Get or create the user's conversation with an AI agent.

    Mirrors ensure_direct_conversation, but the agent is not a participant:
    the conversation carries kind='agent' + agent_id and only the human has a
    participant row (read/clear state is theirs alone).

    With a document context this becomes a per-document conversation
    (kind='agent_doc'): its own singleton per (user, agent, document), kept out
    of the main conversation list, and the agent's RAG search is scoped to it.
    """
    normalized_current = normalize_user_id(current_user_id)
    user = get_user_by_id_or_404(db, normalized_current)

    agent = db.get(Agent, agent_id)
    if agent is None or not agent.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    doc_title: str | None = None
    if context_type is not None and context_id is not None:
        doc_title = _validate_document_context(db, user, context_type, context_id)
        direct_key = build_agent_doc_direct_key(agent.id, normalized_current, context_type, context_id)
        kind = "agent_doc"
    else:
        direct_key = build_agent_direct_key(agent.id, normalized_current)
        kind = "agent"

    existing = _get_existing_direct_conversation(db, direct_key)
    if existing is not None:
        _unhide_for_user(db, existing, normalized_current)
        return existing

    now = datetime.now(timezone.utc)
    conversation = ChatConversation(
        kind=kind,
        direct_key=direct_key,
        agent_id=agent.id,
        created_by_id=normalized_current,
        last_message_at=now,
        title=doc_title[:255] if doc_title else None,
        context_type=context_type,
        context_id=context_id,
        context_title=doc_title[:500] if doc_title else None,
    )
    db.add(conversation)
    db.flush()
    db.add(ChatConversationParticipant(conversation_id=conversation.id, user_id=normalized_current))
    db.commit()
    return _fetch_conversation_with_participants(db, conversation.id)


def ensure_direct_conversation_by_ids(db: Session, user_a_id: Any, user_b_id: Any, created_by_id: Any | None = None) -> ChatConversation:
    user_a = get_user_by_id_or_404(db, user_a_id)
    user_b = get_user_by_id_or_404(db, user_b_id)

    if getattr(user_a, "id") == getattr(user_b, "id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Direct conversation requires two users")

    creator = user_a
    if created_by_id is not None:
        creator = get_user_by_id_or_404(db, created_by_id)
        if getattr(creator, "id") not in {getattr(user_a, "id"), getattr(user_b, "id")}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="created_by_id must match one of the direct-conversation participants")
        other = user_b if getattr(creator, "id") == getattr(user_a, "id") else user_a
        return ensure_direct_conversation(db, getattr(creator, "id"), getattr(other, "id"))

    return ensure_direct_conversation(db, getattr(user_a, "id"), getattr(user_b, "id"))


def _attachment_response(attachment: ChatMessageAttachment) -> AttachmentResponse:
    return AttachmentResponse(
        id=attachment.id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        file_size=attachment.file_size,
        has_thumbnail=attachment.thumbnail_path is not None,
    )


def _message_sender_ref(message: ChatMessage) -> MessageSender:
    if message.sender_agent_id is not None:
        agent = message.sender_agent
        return MessageSender(
            id=None,
            username=getattr(agent, "slug", "agent"),
            full_name=getattr(agent, "display_name", "AI Assistant"),
            display_name=getattr(agent, "display_name", "AI Assistant"),
            roles=[],
            is_agent=True,
            agent_id=message.sender_agent_id,
        )
    sender = message.sender
    return MessageSender(
        id=getattr(sender, "id"),
        username=getattr(sender, "username"),
        full_name=getattr(sender, "full_name"),
        display_name=getattr(sender, "full_name"),
        roles=getattr(sender, "role_names", []),
    )


_REPLY_PREVIEW_MAX_LEN = 200


def _reply_preview(original: ChatMessage) -> RepliedMessagePreview:
    is_deleted = original.deleted_at is not None
    content = "[message deleted]" if is_deleted else original.content[:_REPLY_PREVIEW_MAX_LEN]
    return RepliedMessagePreview(
        id=original.id,
        sender=_message_sender_ref(original),
        content=content,
        is_deleted=is_deleted,
        has_attachments=bool(original.attachments) and not is_deleted,
    )


def _serialize_reactions(message: ChatMessage, current_user_id: Any) -> list[ReactionGroup]:
    """Aggregate a message's reactions by emoji, flagging the current user's own.

    Reactions preserve first-reacted order per emoji so the UI stays stable as
    people react. ``mine`` is personalized to ``current_user_id``.
    """
    normalized_current = normalize_user_id(current_user_id)
    counts: dict[str, int] = {}
    mine: dict[str, bool] = {}
    order: list[str] = []
    for reaction in message.reactions or []:
        emoji = reaction.emoji
        if emoji not in counts:
            counts[emoji] = 0
            mine[emoji] = False
            order.append(emoji)
        counts[emoji] += 1
        if reaction.user_id == normalized_current:
            mine[emoji] = True
    return [ReactionGroup(emoji=emoji, count=counts[emoji], mine=mine[emoji]) for emoji in order]


def serialize_message_for_user(
    message: ChatMessage, current_user_id: Any, include_deleted_content: bool = False
) -> MessageResponse:
    normalized_current = normalize_user_id(current_user_id)
    is_mine = message.sender_id == normalized_current
    is_deleted = message.deleted_at is not None

    content = message.content
    if is_deleted and not include_deleted_content:
        content = "[message deleted]"
    elif is_deleted and is_mine:
        content = message.content if include_deleted_content else "[message deleted]"

    attachments = message.attachments or []
    if is_deleted and not include_deleted_content:
        attachments = []

    sender_ref = _message_sender_ref(message)

    reactions = [] if (is_deleted and not include_deleted_content) else _serialize_reactions(message, normalized_current)

    return MessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        sender=sender_ref,
        content=content,
        attachments=[_attachment_response(att) for att in attachments],
        reply_to=_reply_preview(message.reply_to) if message.reply_to is not None else None,
        reactions=reactions,
        created_at=message.created_at,
        edited_at=message.edited_at,
        is_mine=is_mine,
        is_deleted=is_deleted,
    )


def _get_last_message(db: Session, conversation_id: UUID, cleared_at: datetime | None = None) -> ChatMessage | None:
    conditions = [ChatMessage.conversation_id == conversation_id, ChatMessage.deleted_at.is_(None)]
    if cleared_at is not None:
        conditions.append(ChatMessage.created_at > cleared_at)
    result = db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .options(selectinload(ChatMessage.attachments))
        .options(selectinload(ChatMessage.reply_to))
        .where(and_(*conditions))
        .order_by(desc(ChatMessage.created_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


def _get_unread_count(
    db: Session,
    conversation_id: UUID,
    current_user_id: Any,
    last_read_at: datetime | None,
    cleared_at: datetime | None = None,
) -> int:
    normalized_current = normalize_user_id(current_user_id)
    # sender_id is NULL for agent messages; a plain != would silently drop
    # them from the count (NULL != x is NULL in SQL), so include them explicitly.
    conditions = [
        ChatMessage.conversation_id == conversation_id,
        or_(ChatMessage.sender_id.is_(None), ChatMessage.sender_id != normalized_current),
    ]
    if last_read_at is not None:
        conditions.append(ChatMessage.created_at > last_read_at)
    if cleared_at is not None:
        conditions.append(ChatMessage.created_at > cleared_at)
    result = db.execute(select(func.count(ChatMessage.id)).where(and_(*conditions)))
    return int(result.scalar_one() or 0)


def list_conversations(db: Session, current_user_id: Any) -> list[ConversationSummaryResponse]:
    normalized_current = normalize_user_id(current_user_id)
    result = db.execute(
        select(ChatConversation)
        .join(ChatConversationParticipant, ChatConversationParticipant.conversation_id == ChatConversation.id)
        .options(selectinload(ChatConversation.participants).selectinload(ChatConversationParticipant.user))
        .where(ChatConversationParticipant.user_id == normalized_current)
        # Per-document agent chats live in the document reader panel, not here —
        # opening 50 documents must not flood the main list (or its unread sum).
        .where(ChatConversation.kind != "agent_doc")
        .order_by(desc(ChatConversation.last_message_at), desc(ChatConversation.created_at))
    )
    conversations = list(result.scalars().unique().all())
    summaries: list[ConversationSummaryResponse] = []
    for conversation in conversations:
        current_participant = next(
            participant for participant in conversation.participants if participant.user_id == normalized_current
        )
        # Deleted ("hidden") conversations stay out of the list until new activity
        # or a deliberate reopen resets hidden_at.
        if current_participant.hidden_at is not None:
            continue
        last_message = _get_last_message(db, conversation.id, current_participant.cleared_at)
        unread_count = _get_unread_count(
            db, conversation.id, normalized_current, current_participant.last_read_at, current_participant.cleared_at
        )

        summaries.append(
            ConversationSummaryResponse(
                id=conversation.id,
                kind=conversation.kind,
                title=conversation.title,
                participants=[
                    _participant_reference(participant.user) for participant in conversation.participants if participant.user_id != normalized_current
                ],
                agent=AgentReference.model_validate(conversation.agent) if conversation.agent is not None else None,
                unread_count=unread_count,
                last_message=(serialize_message_for_user(last_message, normalized_current) if last_message else None),
                created_at=conversation.created_at,
                updated_at=conversation.updated_at,
                last_message_at=conversation.last_message_at,
            )
        )
    return summaries


def get_conversation_detail(db: Session, conversation_id: UUID, current_user_id: Any) -> ConversationDetailResponse:
    conversation = get_conversation_for_user(db, conversation_id, current_user_id)
    return ConversationDetailResponse(
        id=conversation.id,
        kind=conversation.kind,
        title=conversation.title,
        participants=[_participant_reference(participant.user) for participant in conversation.participants],
        agent=AgentReference.model_validate(conversation.agent) if conversation.agent is not None else None,
        context_type=conversation.context_type,
        context_id=conversation.context_id,
        context_title=conversation.context_title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        last_message_at=conversation.last_message_at,
    )


def list_messages(db: Session, conversation_id: UUID, current_user_id: Any, limit: int, offset: int) -> MessageListResponse:
    normalized_current = normalize_user_id(current_user_id)
    conversation = get_conversation_for_user(db, conversation_id, normalized_current)
    current_participant = next(
        participant for participant in conversation.participants if participant.user_id == normalized_current
    )
    conditions = [ChatMessage.conversation_id == conversation_id]
    if current_participant.cleared_at is not None:
        conditions.append(ChatMessage.created_at > current_participant.cleared_at)

    total_result = db.execute(select(func.count(ChatMessage.id)).where(and_(*conditions)))
    total = int(total_result.scalar_one() or 0)

    result = db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .options(selectinload(ChatMessage.attachments))
        .options(selectinload(ChatMessage.reply_to))
        .where(and_(*conditions))
        .order_by(desc(ChatMessage.created_at))
        .offset(offset)
        .limit(limit)
    )
    messages = list(result.scalars().all())
    messages.reverse()

    return MessageListResponse(
        items=[serialize_message_for_user(message, normalized_current) for message in messages],
        total=total,
        limit=limit,
        offset=offset,
    )


def create_message(
    db: Session,
    conversation_id: UUID,
    sender_id: Any,
    content: str,
    attachment_ids: list[UUID] | None = None,
    reply_to_id: UUID | None = None,
) -> tuple[ChatMessage, list[Any]]:
    normalized_sender = normalize_user_id(sender_id)
    conversation = get_conversation_for_user(db, conversation_id, normalized_sender)
    trimmed_content = content.strip()
    attachment_ids = attachment_ids or []

    if not trimmed_content and not attachment_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty")

    if len(attachment_ids) > settings.MAX_ATTACHMENTS_PER_MESSAGE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {settings.MAX_ATTACHMENTS_PER_MESSAGE} attachments per message",
        )

    if reply_to_id is not None:
        reply_target = db.get(ChatMessage, reply_to_id)
        if reply_target is None or reply_target.conversation_id != conversation_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Replied-to message not found in this conversation",
            )

    message = ChatMessage(
        conversation_id=conversation_id,
        sender_id=normalized_sender,
        content=trimmed_content,
        reply_to_id=reply_to_id,
    )
    db.add(message)
    db.flush()

    if attachment_ids:
        attachments_result = db.execute(
            select(ChatMessageAttachment).where(
                ChatMessageAttachment.id.in_(attachment_ids),
                ChatMessageAttachment.uploader_id == normalized_sender,
                ChatMessageAttachment.message_id.is_(None),
            )
        )
        attachments = list(attachments_result.scalars().all())
        if len(attachments) != len(attachment_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more attachments are invalid, already used, or do not belong to you",
            )
        for att in attachments:
            att.message_id = message.id

    now = datetime.now(timezone.utc)
    conversation.last_message_at = now
    conversation.updated_at = now
    # New activity resurfaces the conversation for anyone who deleted it.
    for participant in conversation.participants:
        participant.hidden_at = None
    db.flush()
    db.commit()

    stored_result = db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .options(selectinload(ChatMessage.attachments))
        .options(selectinload(ChatMessage.reply_to))
        .where(ChatMessage.id == message.id)
    )
    stored_message = stored_result.scalar_one()
    participants_ids = [participant.user_id for participant in conversation.participants]
    return stored_message, participants_ids


def create_agent_message(
    db: Session, conversation_id: UUID, agent_id: Any, content: str
) -> tuple[ChatMessage, list[Any]]:
    """Persist a message sent by an AI agent into its conversation.

    The agent is not a participant, so the membership check that guards
    create_message doesn't apply; the conversation must be a kind='agent'
    conversation belonging to this agent.
    """
    conversation = _fetch_conversation_with_participants(db, conversation_id)
    if conversation.kind not in ("agent", "agent_doc") or conversation.agent_id != agent_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not an agent conversation for this agent")

    trimmed_content = content.strip()
    if not trimmed_content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty")

    message = ChatMessage(conversation_id=conversation_id, sender_agent_id=agent_id, content=trimmed_content)
    db.add(message)
    now = datetime.now(timezone.utc)
    conversation.last_message_at = now
    conversation.updated_at = now
    # New activity resurfaces the conversation for anyone who deleted it.
    for participant in conversation.participants:
        participant.hidden_at = None
    db.commit()

    stored_result = db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender_agent))
        .options(selectinload(ChatMessage.attachments))
        .options(selectinload(ChatMessage.reply_to))
        .where(ChatMessage.id == message.id)
    )
    stored_message = stored_result.scalar_one()
    participants_ids = [participant.user_id for participant in conversation.participants]
    return stored_message, participants_ids


def delete_message(
    db: Session, message_id: UUID, current_user_id: Any
) -> tuple[ChatMessage, list[Any]]:
    """Soft-delete a message. Only the sender can delete their own messages."""
    normalized_current = normalize_user_id(current_user_id)

    result = db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .options(selectinload(ChatMessage.conversation))
        .where(ChatMessage.id == message_id)
    )
    message = result.scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    if message.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message already deleted")
    if message.sender_id != normalized_current:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the sender can delete their message")

    # Check if current user is a participant in the conversation
    conversation = message.conversation
    if not any(p.user_id == normalized_current for p in conversation.participants):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant of this conversation")

    now = datetime.now(timezone.utc)
    message.deleted_at = now
    db.commit()

    participants_ids = [p.user_id for p in conversation.participants]
    return message, participants_ids


def set_reaction(
    db: Session, message_id: UUID, current_user_id: Any, emoji: str
) -> tuple[ChatMessage, list[Any]]:
    """Set/replace/remove the current user's reaction on a received message.

    WhatsApp semantics: a user holds at most one reaction per message. Sending
    the emoji already set toggles it off; sending a different emoji replaces it.
    Reactions are only allowed on *received* messages — you cannot react to your
    own message. Returns the refreshed message and the conversation participants.
    """
    normalized_current = normalize_user_id(current_user_id)
    emoji = emoji.strip()
    if not emoji:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Emoji cannot be empty")

    result = db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.conversation).selectinload(ChatConversation.participants))
        .where(ChatMessage.id == message_id)
    )
    message = result.scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    if message.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot react to a deleted message")

    conversation = message.conversation
    if not any(p.user_id == normalized_current for p in conversation.participants):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant of this conversation")

    # Reactions apply to received messages only — never to your own.
    if message.sender_id == normalized_current:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot react to your own message")

    existing = db.get(ChatMessageReaction, (message_id, normalized_current))
    if existing is None:
        db.add(ChatMessageReaction(message_id=message_id, user_id=normalized_current, emoji=emoji))
    elif existing.emoji == emoji:
        # Same emoji again → toggle the reaction off.
        db.delete(existing)
    else:
        existing.emoji = emoji
    db.commit()

    stored_result = db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .options(selectinload(ChatMessage.sender_agent))
        .options(selectinload(ChatMessage.attachments))
        .options(selectinload(ChatMessage.reply_to))
        .options(selectinload(ChatMessage.reactions))
        .where(ChatMessage.id == message_id)
    )
    stored_message = stored_result.scalar_one()
    participants_ids = [p.user_id for p in conversation.participants]
    return stored_message, participants_ids


def mark_conversation_read(db: Session, conversation_id: UUID, current_user_id: Any) -> tuple[datetime, list[Any]]:
    normalized_current = normalize_user_id(current_user_id)
    conversation = get_conversation_for_user(db, conversation_id, normalized_current)
    participant = next(participant for participant in conversation.participants if participant.user_id == normalized_current)
    now = datetime.now(timezone.utc)
    participant.last_read_at = now
    db.commit()
    participants_ids = [item.user_id for item in conversation.participants]
    return now, participants_ids


def clear_conversation(db: Session, conversation_id: UUID, current_user_id: Any) -> datetime:
    """Clear the conversation for the current user only.

    Marks a per-participant ``cleared_at`` timestamp so that all messages created
    at or before now are hidden from this user's view. The other participant's
    history is untouched, and messages sent afterwards still appear normally.
    """
    normalized_current = normalize_user_id(current_user_id)
    conversation = get_conversation_for_user(db, conversation_id, normalized_current)
    participant = next(
        participant for participant in conversation.participants if participant.user_id == normalized_current
    )
    now = datetime.now(timezone.utc)
    participant.cleared_at = now
    db.commit()
    return now


def delete_conversation(db: Session, conversation_id: UUID, current_user_id: Any) -> datetime:
    """Delete the conversation for the current user only.

    Clears the message history (``cleared_at``) and hides the conversation from
    this user's list (``hidden_at``). The other participant keeps the
    conversation and its history; a new message from either side resurfaces the
    conversation for everyone (with only post-clear messages visible here).
    """
    normalized_current = normalize_user_id(current_user_id)
    conversation = get_conversation_for_user(db, conversation_id, normalized_current)
    participant = next(
        participant for participant in conversation.participants if participant.user_id == normalized_current
    )
    now = datetime.now(timezone.utc)
    participant.cleared_at = now
    participant.hidden_at = now
    db.commit()
    return now


def get_partner_user_ids(db: Session, user_id: Any) -> list[Any]:
    normalized = normalize_user_id(user_id)
    conv_ids_result = db.execute(
        select(ChatConversationParticipant.conversation_id).where(ChatConversationParticipant.user_id == normalized)
    )
    conv_ids = [row[0] for row in conv_ids_result.all()]
    if not conv_ids:
        return []
    partners_result = db.execute(
        select(ChatConversationParticipant.user_id)
        .where(
            and_(
                ChatConversationParticipant.conversation_id.in_(conv_ids),
                ChatConversationParticipant.user_id != normalized,
            )
        )
        .distinct()
    )
    return list(partners_result.scalars().all())


# ---------------------------------------------------------------------------
# Attachment helpers
# ---------------------------------------------------------------------------

def _safe_filename(name: str) -> str:
    """Remove path separators and keep only the basename."""
    return Path(name).name


def _validate_uploaded_file(content_type: str, file_bytes: bytes) -> None:
    if content_type not in settings.ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{content_type}' is not allowed",
        )

    if len(file_bytes) > settings.MAX_ATTACHMENT_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.MAX_ATTACHMENT_SIZE_BYTES // (1024 * 1024)} MB",
        )

    kind = filetype.guess(file_bytes)
    if kind is None:
        # Some text files may not have recognizable magic bytes; accept if declared type is text/*
        if not content_type.startswith("text/") and content_type != "application/json":
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unable to verify file type",
            )
        return

    # Map common magic-byte types to MIME types for cross-check
    magic_to_mime = {
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif",
        "webp": "image/webp",
        "pdf": "application/pdf",
        "mp4": "video/mp4",
        "webm": "video/webm",
        "mov": "video/quicktime",
        "avi": "video/x-msvideo",
    }
    expected = magic_to_mime.get(kind.extension, kind.mime)
    # Allow some flexibility (e.g. image/jpg vs image/jpeg)
    loosely_match = (
        expected == content_type
        or (expected == "image/jpeg" and content_type == "image/jpg")
        or (expected == "video/quicktime" and content_type == "video/mp4")
    )
    if not loosely_match:
        # If magic bytes say something wildly different, reject
        expected_major = expected.split("/")[0]
        declared_major = content_type.split("/")[0]
        if expected_major != declared_major:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"File content does not match declared type ({content_type})",
            )


def _generate_thumbnail(image_path: Path, thumb_path: Path) -> None:
    with Image.open(image_path) as img:
        img.thumbnail((400, 400))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.save(thumb_path, "JPEG", quality=85)


def save_uploaded_file(file_bytes: bytes, filename: str, content_type: str) -> tuple[Path, Path | None]:
    _validate_uploaded_file(content_type, file_bytes)

    now = datetime.now(timezone.utc)
    rel_dir = Path(str(now.year)) / f"{now.month:02d}"
    dest_dir = settings.PRIVATE_UPLOAD_DIR / rel_dir
    dest_dir.mkdir(parents=True, exist_ok=True)

    file_id = uuid4()
    safe_name = _safe_filename(filename)
    ext = Path(safe_name).suffix
    storage_path = dest_dir / f"{file_id}{ext}"
    storage_path.write_bytes(file_bytes)

    thumbnail_path: Path | None = None
    if content_type.startswith("image/") and content_type != "image/svg+xml":
        thumbnail_path = dest_dir / f"thumb_{file_id}.jpg"
        try:
            _generate_thumbnail(storage_path, thumbnail_path)
        except Exception:
            thumbnail_path = None

    return storage_path, thumbnail_path


def can_access_attachment(db: Session, attachment: ChatMessageAttachment, user_id: Any) -> bool:
    normalized = normalize_user_id(user_id)
    if attachment.uploader_id == normalized:
        return True
    if attachment.message_id is None:
        return False
    # Check conversation membership
    msg_result = db.execute(
        select(ChatMessage.conversation_id).where(ChatMessage.id == attachment.message_id)
    )
    conversation_id = msg_result.scalar_one_or_none()
    if conversation_id is None:
        return False
    participant_result = db.execute(
        select(ChatConversationParticipant)
        .where(
            ChatConversationParticipant.conversation_id == conversation_id,
            ChatConversationParticipant.user_id == normalized,
        )
    )
    return participant_result.scalar_one_or_none() is not None


def cleanup_orphan_attachments(db: Session) -> int:
    """Delete unlinked attachments older than 24 hours. Returns count deleted."""
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    result = db.execute(
        select(ChatMessageAttachment).where(
            ChatMessageAttachment.message_id.is_(None),
            ChatMessageAttachment.created_at < cutoff,
        )
    )
    orphans = list(result.scalars().all())
    deleted = 0
    for att in orphans:
        try:
            file_path = settings.PRIVATE_UPLOAD_DIR / att.storage_path
            if file_path.exists():
                file_path.unlink()
            if att.thumbnail_path:
                thumb_path = settings.PRIVATE_UPLOAD_DIR / att.thumbnail_path
                if thumb_path.exists():
                    thumb_path.unlink()
        except Exception:
            logger.exception("Failed to delete orphan attachment files: %s", att.id)
        db.delete(att)
        deleted += 1
    if deleted:
        db.commit()
        logger.info("Cleaned up %d orphan attachments", deleted)
    return deleted
