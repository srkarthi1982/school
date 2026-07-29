from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.agent.models import Agent
from app.modules.agent.schemas import AgentListResponse, AgentReference

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=AgentListResponse)
def list_agents(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> AgentListResponse:
    """Active AI agents available to chat with (e.g. for the pinned entry)."""
    agents = db.execute(
        select(Agent).where(Agent.is_active.is_(True)).order_by(Agent.display_name)
    ).scalars().all()
    return AgentListResponse(items=[AgentReference.model_validate(a) for a in agents])
