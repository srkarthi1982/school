from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AgentReference(BaseModel):
    id: UUID
    slug: str
    display_name: str
    description: str | None = None
    avatar_url: str | None = None
    model_config = ConfigDict(from_attributes=True)


class AgentListResponse(BaseModel):
    items: list[AgentReference]
