from __future__ import annotations
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class UserReference(BaseModel):
    id: int | None = None
    email: str | None = None
    username: str
    full_name: str
    display_name: str
    roles: list[str]
    auth_provider: str | None = None
    is_online: bool = False
    is_active: bool = True
    avatar_url: str | None = None
    # AI agents can appear in search results / conversation headers. They are
    # not users: id is None and agent_id identifies them instead.
    is_agent: bool = False
    agent_id: UUID | None = None
    model_config = ConfigDict(from_attributes=True)


class UserSearchResponse(BaseModel):
    items: list[UserReference]


class AgentReference(BaseModel):
    id: UUID
    slug: str
    display_name: str
    description: str | None = None
    avatar_url: str | None = None
    model_config = ConfigDict(from_attributes=True)


class MessageSender(BaseModel):
    id: int | None = None
    username: str
    full_name: str
    display_name: str
    roles: list[str]
    is_agent: bool = False
    agent_id: UUID | None = None


class AttachmentResponse(BaseModel):
    id: UUID
    filename: str
    content_type: str
    file_size: int
    has_thumbnail: bool
    model_config = ConfigDict(from_attributes=True)


class RepliedMessagePreview(BaseModel):
    """Compact view of the message a reply quotes — enough to render the
    quote block without shipping the full original message."""
    id: UUID
    sender: MessageSender
    content: str
    is_deleted: bool = False
    has_attachments: bool = False


class ReactionGroup(BaseModel):
    """One emoji reaction on a message, aggregated across all reactors.

    ``mine`` is personalized: it is True when the user the message is being
    serialized for is one of the reactors with this emoji.
    """
    emoji: str
    count: int
    mine: bool = False


class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    sender: MessageSender
    content: str
    attachments: list[AttachmentResponse] = []
    reply_to: RepliedMessagePreview | None = None
    reactions: list[ReactionGroup] = []
    created_at: datetime
    edited_at: datetime | None = None
    is_mine: bool
    is_deleted: bool = False


class CreateDirectConversationRequest(BaseModel):
    participant_id: int


class CreateAgentConversationRequest(BaseModel):
    agent_id: UUID
    # Optional document scope (at most one): makes this a per-document chat
    # (kind='agent_doc') whose RAG search is restricted to that document.
    library_material_id: int | None = None
    material_file_id: UUID | None = None


class CreateMessageRequest(BaseModel):
    content: str = Field(default="", min_length=0, max_length=4000)
    attachment_ids: list[UUID] = Field(default=[], max_length=5)
    reply_to_id: UUID | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"content": "Hello!", "attachment_ids": []},
            ]
        }
    }


class SetReactionRequest(BaseModel):
    # A single emoji. Sending the emoji already on the message toggles it off.
    emoji: str = Field(min_length=1, max_length=16)


class ConversationSummaryResponse(BaseModel):
    id: UUID
    kind: str
    title: str | None = None
    participants: list[UserReference]
    agent: AgentReference | None = None
    unread_count: int
    last_message: MessageResponse | None = None
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime | None = None


class ConversationDetailResponse(BaseModel):
    id: UUID
    kind: str
    title: str | None = None
    participants: list[UserReference]
    agent: AgentReference | None = None
    # Document scope of a kind='agent_doc' conversation.
    context_type: str | None = None
    context_id: str | None = None
    context_title: str | None = None
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime | None = None


class MessageListResponse(BaseModel):
    items: list[MessageResponse]
    total: int
    limit: int
    offset: int


class ReadConversationResponse(BaseModel):
    conversation_id: UUID
    read_at: datetime


class ClearConversationResponse(BaseModel):
    conversation_id: UUID
    cleared_at: datetime


class DeleteConversationResponse(BaseModel):
    conversation_id: UUID
    deleted_at: datetime


class SendMessagePayload(BaseModel):
    type: str = Field(default="message")
    conversation_id: UUID
    content: str = Field(default="", min_length=0, max_length=4000)
    attachment_ids: list[UUID] = Field(default=[], max_length=5)
    reply_to_id: UUID | None = None


class TypingPayload(BaseModel):
    type: str = Field(default="typing")
    conversation_id: UUID
    is_typing: bool


class SubscribePayload(BaseModel):
    type: str = Field(default="subscribe")
    conversation_id: UUID


class UnsubscribePayload(BaseModel):
    type: str = Field(default="unsubscribe")
    conversation_id: UUID


class ReadPayload(BaseModel):
    type: str = Field(default="read")
    conversation_id: UUID
