from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CreateTokenRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    expires_in_days: Literal[30, 90, 180] = 90


class TokenResponse(BaseModel):
    id: UUID
    name: str
    token_prefix: str
    expires_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class CreatedTokenResponse(TokenResponse):
    # Plaintext token — returned exactly once, at creation.
    token: str


class TokenListResponse(BaseModel):
    items: list[TokenResponse]
