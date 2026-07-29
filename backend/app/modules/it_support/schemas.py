from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

TicketStatusLiteral = Literal["submitted", "approved", "declined", "viewed", "resolved"]
BoxLiteral = Literal["inbox", "all"]


class UserSummary(BaseModel):
    id: int
    username: str
    full_name: str

    model_config = {"from_attributes": True}


class CreateTicketPayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)


class ApprovePayload(BaseModel):
    target_user_id: int | None = None


class DeclinePayload(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class ResolvePayload(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class ForwardPayload(BaseModel):
    to_user_id: int
    note: str | None = Field(default=None, max_length=2000)


class TicketHistoryEntry(BaseModel):
    id: int
    actor: UserSummary | None = None
    from_status: TicketStatusLiteral | None = None
    to_status: TicketStatusLiteral
    note: str | None = None
    forwarded_to: UserSummary | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TicketSummary(BaseModel):
    id: int
    title: str
    status: TicketStatusLiteral
    created_by: UserSummary | None = None
    assigned_to: UserSummary | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TicketDetail(TicketSummary):
    description: str
    resolution_notes: str | None = None
    decline_reason: str | None = None
    history: list[TicketHistoryEntry] = []


class TicketListResponse(BaseModel):
    items: list[TicketSummary]


__all__ = [
    "ApprovePayload",
    "BoxLiteral",
    "CreateTicketPayload",
    "DeclinePayload",
    "ForwardPayload",
    "ResolvePayload",
    "TicketDetail",
    "TicketHistoryEntry",
    "TicketListResponse",
    "TicketStatusLiteral",
    "TicketSummary",
    "UserSummary",
]
