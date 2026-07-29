from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TicketStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    APPROVED = "approved"
    DECLINED = "declined"
    VIEWED = "viewed"
    RESOLVED = "resolved"


TERMINAL_STATUSES = frozenset(
    {TicketStatus.DECLINED.value, TicketStatus.RESOLVED.value}
)

_VALID_STATUSES = ", ".join(f"'{s.value}'" for s in TicketStatus)


class Ticket(Base):
    __tablename__ = "it_tickets"
    __table_args__ = (
        CheckConstraint(
            f"status IN ({_VALID_STATUSES})",
            name="ck_it_tickets_status_valid",
        ),
        Index("ix_it_tickets_created_by_status", "created_by_id", "status"),
        Index("ix_it_tickets_assigned_to_status", "assigned_to_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=TicketStatus.SUBMITTED.value, index=True
    )

    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assigned_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    decline_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    creator = relationship("User", foreign_keys=[created_by_id], lazy="joined")
    assignee = relationship("User", foreign_keys=[assigned_to_id], lazy="joined")
    history = relationship(
        "TicketHistory",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketHistory.created_at",
    )


class TicketHistory(Base):
    __tablename__ = "it_ticket_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("it_tickets.id", ondelete="CASCADE"), nullable=False, index=True
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

    ticket = relationship("Ticket", back_populates="history")
    actor = relationship("User", foreign_keys=[actor_id], lazy="joined")
    forwarded_to = relationship("User", foreign_keys=[forwarded_to_id], lazy="joined")


__all__ = ["Ticket", "TicketHistory", "TicketStatus", "TERMINAL_STATUSES"]
