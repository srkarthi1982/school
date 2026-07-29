from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.pat.schemas import (
    CreatedTokenResponse,
    CreateTokenRequest,
    TokenListResponse,
    TokenResponse,
)
from app.modules.pat.services import create_pat, list_pats, revoke_pat

router = APIRouter(prefix="/pats", tags=["personal-access-tokens"])


@router.post("", response_model=CreatedTokenResponse)
def create_token(
    payload: CreateTokenRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> CreatedTokenResponse:
    """Create a personal access token (e.g. for MCP clients). The plaintext
    token is returned only in this response — store it now."""
    record, token = create_pat(db, current_user.id, payload.name, payload.expires_in_days)
    return CreatedTokenResponse(
        id=record.id,
        name=record.name,
        token_prefix=record.token_prefix,
        expires_at=record.expires_at,
        last_used_at=record.last_used_at,
        revoked_at=record.revoked_at,
        created_at=record.created_at,
        token=token,
    )


@router.get("", response_model=TokenListResponse)
def list_tokens(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> TokenListResponse:
    return TokenListResponse(items=[TokenResponse.model_validate(t) for t in list_pats(db, current_user.id)])


@router.delete("/{token_id}", response_model=TokenResponse)
def revoke_token(
    token_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> TokenResponse:
    return TokenResponse.model_validate(revoke_pat(db, current_user.id, token_id))
