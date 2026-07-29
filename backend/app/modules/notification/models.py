from __future__ import annotations
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.modules.notification.host_integration import (
    USER_TABLE_NAME,
    User,
    user_id_column_type,
)


class NotificationTemplate(TimestampMixin, Base):
    __tablename__ = "notification_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    source_module: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    next_notifications_on: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_notification_templates_source_module", "source_module"),
    )


class NotificationRecipient(TimestampMixin, Base):
    __tablename__ = "notification_recipients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("notification_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recipient_id: Mapped[int] = mapped_column(
        user_id_column_type(),
        ForeignKey(f"{USER_TABLE_NAME}.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    recipient = relationship(User, foreign_keys=[recipient_id], lazy="joined")
    template = relationship(NotificationTemplate, foreign_keys=[template_id], lazy="joined")

    __table_args__ = (
        Index("ix_notification_recipients_unread", "recipient_id", "read_at"),
    )


__all__ = ["NotificationTemplate", "NotificationRecipient"]