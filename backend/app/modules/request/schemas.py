from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.request.models import RequestStatus

StatusLiteral = Literal[
    "created", "viewed", "returned", "edited", "resolved", "approved", "canceled"
]
BoxLiteral = Literal["inbox", "sent", "unclaimed"]


class UserSummary(BaseModel):
    id: int
    username: str
    full_name: str

    model_config = {"from_attributes": True}


class CreateRequestPayload(BaseModel):
    purpose: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    recipient_id: int | None = None  # ignored for student; required for teacher/admin


class EditRequestPayload(BaseModel):
    purpose: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)


class TransitionPayload(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class ReturnPayload(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class ForwardPayload(BaseModel):
    recipient_id: int
    note: str | None = Field(default=None, max_length=2000)


class StatusHistoryEntry(BaseModel):
    id: int
    actor: UserSummary | None = None
    from_status: StatusLiteral | None = None
    to_status: StatusLiteral
    note: str | None = None
    forwarded_to: UserSummary | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RequestSummary(BaseModel):
    id: UUID
    purpose: str
    status: StatusLiteral
    created_by: UserSummary | None = None
    current_recipient: UserSummary | None = None
    recipient_pool: str | None = None
    created_at: datetime
    updated_at: datetime
    viewed_at: datetime | None = None
    resolved_at: datetime | None = None

    model_config = {"from_attributes": True}


class RequestDetail(RequestSummary):
    description: str
    return_reason: str | None = None
    history: list[StatusHistoryEntry] = []


class RequestListResponse(BaseModel):
    items: list[RequestSummary]


class RequestConfigResponse(BaseModel):
    overdue_after_days: int
    updated_at: datetime | None = None


class UpdateConfigPayload(BaseModel):
    overdue_after_days: int = Field(ge=1, le=365)


class OverdueNotificationItem(BaseModel):
    id: int
    request_id: UUID
    request_purpose: str
    request_status: StatusLiteral
    created_at: datetime
    read_at: datetime | None = None

    model_config = {"from_attributes": True}


class OverdueNotificationListResponse(BaseModel):
    items: list[OverdueNotificationItem]


__all__ = [
    "BoxLiteral",
    "CreateRequestPayload",
    "EditRequestPayload",
    "ForwardPayload",
    "OverdueNotificationItem",
    "OverdueNotificationListResponse",
    "RequestConfigResponse",
    "RequestDetail",
    "RequestListResponse",
    "RequestSummary",
    "ReturnPayload",
    "StatusHistoryEntry",
    "StatusLiteral",
    "TransitionPayload",
    "UpdateConfigPayload",
    "UserSummary",
]
