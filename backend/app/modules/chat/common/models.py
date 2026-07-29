from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.modules.chat.host_integration import Base, USER_TABLE_NAME, User, user_id_column_type
from app.modules.agent.models import Agent


class ChatConversation(Base):
    __tablename__ = "chat_conversations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # 'direct' = user↔user; 'agent' = user↔AI agent (the agent is NOT a
    # participant — its membership is implied by agent_id); 'agent_doc' = a
    # user↔agent conversation scoped to one document (context_* below) — kept
    # out of the main conversation list.
    kind: Mapped[str] = mapped_column(String(50), default="direct", nullable=False)
    direct_key: Mapped[str | None] = mapped_column(String(600), unique=True, nullable=True, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Document scope for kind='agent_doc': 'library' (context_id = int as text)
    # or 'course_material' (context_id = file UUID as text). No FK on purpose —
    # the conversation outlives the document; context_title keeps the name for
    # the header/prompt after the source row is gone.
    context_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    context_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    context_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True, index=True)
    created_by_id: Mapped[int] = mapped_column(user_id_column_type(), ForeignKey(f"{USER_TABLE_NAME}.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by = relationship(User, foreign_keys=[created_by_id], lazy="joined")
    agent = relationship(Agent, foreign_keys=[agent_id], lazy="joined")
    participants = relationship("ChatConversationParticipant", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="conversation", cascade="all, delete-orphan")


class ChatConversationParticipant(Base):
    __tablename__ = "chat_conversation_participants"
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("chat_conversations.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(user_id_column_type(), ForeignKey(f"{USER_TABLE_NAME}.id", ondelete="CASCADE"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # When set, messages created at or before this timestamp are hidden from this
    # participant only ("clear chat"). The other participant's view is unaffected.
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # When set, the conversation is hidden from this participant's list ("delete
    # conversation"). Reset to NULL when a new message arrives or the participant
    # deliberately reopens the conversation, so it resurfaces with fresh history.
    hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    conversation = relationship("ChatConversation", back_populates="participants")
    user = relationship(User, foreign_keys=[user_id], lazy="joined")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    # A message is sent either by a user (sender_id) or by an AI agent
    # (sender_agent_id) — exactly one of the two is set.
    __table_args__ = (
        CheckConstraint(
            "sender_id IS NOT NULL OR sender_agent_id IS NOT NULL",
            name="ck_chat_messages_sender_present",
        ),
        Index("ix_chat_messages_conversation_created", "conversation_id", "created_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False)
    sender_id: Mapped[int | None] = mapped_column(user_id_column_type(), ForeignKey(f"{USER_TABLE_NAME}.id", ondelete="CASCADE"), nullable=True)
    sender_agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Quoted-reply target ("reply to message"). SET NULL on hard delete; soft
    # deletes keep the row so the quote can render "[message deleted]".
    reply_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    conversation = relationship("ChatConversation", back_populates="messages")
    reply_to = relationship("ChatMessage", remote_side="ChatMessage.id", foreign_keys=[reply_to_id])
    sender = relationship(User, foreign_keys=[sender_id], lazy="joined")
    sender_agent = relationship(Agent, foreign_keys=[sender_agent_id], lazy="joined")
    attachments = relationship("ChatMessageAttachment", back_populates="message", cascade="all, delete-orphan", lazy="selectin")
    reactions = relationship("ChatMessageReaction", back_populates="message", cascade="all, delete-orphan", lazy="selectin")


class ChatMessageAttachment(Base):
    __tablename__ = "chat_message_attachments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=True
    )
    uploader_id: Mapped[int] = mapped_column(user_id_column_type(), ForeignKey(f"{USER_TABLE_NAME}.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    thumbnail_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    message = relationship("ChatMessage", back_populates="attachments")


class ChatMessageReaction(Base):
    __tablename__ = "chat_message_reactions"
    # WhatsApp-style: a user holds at most one reaction per message, so the
    # (message, user) pair is the primary key — reacting again replaces the
    # emoji, reacting with the same emoji removes it (handled in the service).
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        user_id_column_type(), ForeignKey(f"{USER_TABLE_NAME}.id", ondelete="CASCADE"), primary_key=True
    )
    emoji: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    message = relationship("ChatMessage", back_populates="reactions")
    user = relationship(User, foreign_keys=[user_id], lazy="joined")


__all__ = ["ChatConversation", "ChatConversationParticipant", "ChatMessage", "ChatMessageAttachment", "ChatMessageReaction"]
