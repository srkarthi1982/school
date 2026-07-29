from __future__ import annotations
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class NotificationTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str | None
    body: str | None
    payload: dict[str, Any] | None
    source_module: str
    source_id: str | None
    link: str | None
    created_at: datetime
    updated_at: datetime


class NotificationRecipientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_id: int
    recipient_id: int
    read_at: datetime | None
    created_at: datetime
    updated_at: datetime


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_id: int
    recipient_id: int
    type: str
    title: str | None
    body: str | None
    payload: dict[str, Any] | None
    source_module: str
    source_id: str | None
    link: str | None
    read_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SummaryNotificationResponse(BaseModel):
    notification: NotificationResponse
    unread_count: int
    total_count: int


class UnreadCountResponse(BaseModel):
    count: int


class MarkAllReadResponse(BaseModel):
    count: int


class WsReadPayload(BaseModel):
    type: str
    id: int


class WsMarkAllReadPayload(BaseModel):
    type: str