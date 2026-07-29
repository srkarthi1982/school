from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RequestStatus(str, enum.Enum):
    CREATED = "created"
    VIEWED = "viewed"
    RETURNED = "returned"
    EDITED = "edited"
    RESOLVED = "resolved"
    APPROVED = "approved"
    CANCELED = "canceled"


TERMINAL_STATUSES = frozenset(
    {RequestStatus.RESOLVED.value, RequestStatus.APPROVED.value, RequestStatus.CANCELED.value}
)


class RecipientPool(str, enum.Enum):
    TEACHERS = "teachers"


_VALID_STATUSES = ", ".join(f"'{s.value}'" for s in RequestStatus)


class Request(Base):
    __tablename__ = "requests"
    __table_args__ = (
        CheckConstraint(
            f"status IN ({_VALID_STATUSES})",
            name="ck_requests_status_valid",
        ),
        CheckConstraint(
            "(recipient_pool IS NOT NULL AND current_recipient_id IS NULL) "
            "OR (recipient_pool IS NULL AND current_recipient_id IS NOT NULL)",
            name="ck_requests_pool_xor_recipient",
        ),
        Index("ix_requests_current_recipient_status", "current_recipient_id", "status"),
        Index("ix_requests_created_by_status", "created_by_id", "status"),
        Index("ix_requests_pool_status", "recipient_pool", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purpose: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=RequestStatus.CREATED.value, index=True)

    created_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    current_recipient_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    original_recipient_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    recipient_pool: Mapped[str | None] = mapped_column(String(20), nullable=True)

    return_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    overdue_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    creator = relationship("User", foreign_keys=[created_by_id], lazy="joined")
    current_recipient = relationship("User", foreign_keys=[current_recipient_id], lazy="joined")
    history = relationship(
        "RequestStatusHistory",
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="RequestStatusHistory.created_at",
    )


class RequestStatusHistory(Base):
    __tablename__ = "request_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    forwarded_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    request = relationship("Request", back_populates="history")
    actor = relationship("User", foreign_keys=[actor_id], lazy="joined")
    forwarded_to = relationship("User", foreign_keys=[forwarded_to_id], lazy="joined")


class RequestNotificationConfig(Base):
    __tablename__ = "request_notification_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    overdue_after_days: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    updated_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class RequestOverdueNotification(Base):
    __tablename__ = "request_overdue_notifications"
    __table_args__ = (
        Index("ix_request_overdue_admin_unread", "admin_id", "read_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    admin_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    request = relationship("Request", lazy="joined")


__all__ = [
    "Request",
    "RequestStatus",
    "RequestStatusHistory",
    "RequestNotificationConfig",
    "RequestOverdueNotification",
    "RecipientPool",
    "TERMINAL_STATUSES",
]
