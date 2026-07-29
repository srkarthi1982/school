from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.modules.it_support import services
from app.modules.it_support.models import Ticket
from app.modules.it_support.schemas import (
    ApprovePayload,
    BoxLiteral,
    CreateTicketPayload,
    DeclinePayload,
    ForwardPayload,
    ResolvePayload,
    TicketDetail,
    TicketHistoryEntry,
    TicketListResponse,
    TicketSummary,
    UserSummary,
)
from app.modules.users.models import User

router = APIRouter(prefix="/it-support/tickets", tags=["IT Support"])


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------
def _user_summary(user: User | None) -> UserSummary | None:
    if user is None:
        return None
    return UserSummary(id=user.id, username=user.username, full_name=user.full_name)


def _summary(ticket: Ticket) -> TicketSummary:
    return TicketSummary(
        id=ticket.id,
        title=ticket.title,
        status=ticket.status,
        created_by=_user_summary(ticket.creator),
        assigned_to=_user_summary(ticket.assignee),
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
    )


def _detail(ticket: Ticket) -> TicketDetail:
    history = [
        TicketHistoryEntry(
            id=h.id,
            actor=_user_summary(h.actor),
            from_status=h.from_status,
            to_status=h.to_status,
            note=h.note,
            forwarded_to=_user_summary(h.forwarded_to),
            created_at=h.created_at,
        )
        for h in ticket.history
    ]
    return TicketDetail(
        id=ticket.id,
        title=ticket.title,
        description=ticket.description,
        status=ticket.status,
        created_by=_user_summary(ticket.creator),
        assigned_to=_user_summary(ticket.assignee),
        resolution_notes=ticket.resolution_notes,
        decline_reason=ticket.decline_reason,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        history=history,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("", response_model=TicketDetail, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: CreateTicketPayload,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.TICKET_CREATE)),
) -> TicketDetail:
    ticket = services.create_ticket(db, actor, payload.title, payload.description)
    return _detail(ticket)


@router.get("", response_model=TicketListResponse)
def list_tickets(
    box: BoxLiteral = Query("inbox"),
    q: str | None = Query(None, max_length=200),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> TicketListResponse:
    items = services.list_tickets(db, actor, box=box, q=q)
    return TicketListResponse(items=[_summary(t) for t in items])


@router.get("/{ticket_id}", response_model=TicketDetail)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> TicketDetail:
    ticket = services.get_ticket_for_user(db, ticket_id, actor)
    return _detail(ticket)


@router.post("/{ticket_id}/approve", response_model=TicketDetail)
def approve_ticket(
    ticket_id: int,
    payload: ApprovePayload | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.TICKET_APPROVE)),
) -> TicketDetail:
    ticket = services.get_ticket_or_404(db, ticket_id)
    target = payload.target_user_id if payload else None
    ticket = services.approve_ticket(db, ticket, actor, target)
    return _detail(ticket)


@router.post("/{ticket_id}/decline", response_model=TicketDetail)
def decline_ticket(
    ticket_id: int,
    payload: DeclinePayload,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.TICKET_APPROVE)),
) -> TicketDetail:
    ticket = services.get_ticket_or_404(db, ticket_id)
    ticket = services.decline_ticket(db, ticket, actor, payload.reason)
    return _detail(ticket)


@router.post("/{ticket_id}/claim", response_model=TicketDetail)
def claim_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.TICKET_RESPOND)),
) -> TicketDetail:
    ticket = services.get_ticket_or_404(db, ticket_id)
    ticket = services.claim_ticket(db, ticket, actor)
    return _detail(ticket)


@router.post("/{ticket_id}/resolve", response_model=TicketDetail)
def resolve_ticket(
    ticket_id: int,
    payload: ResolvePayload,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.TICKET_RESPOND)),
) -> TicketDetail:
    ticket = services.get_ticket_or_404(db, ticket_id)
    ticket = services.resolve_ticket(db, ticket, actor, payload.note)
    return _detail(ticket)


@router.post("/{ticket_id}/forward", response_model=TicketDetail)
def forward_ticket(
    ticket_id: int,
    payload: ForwardPayload,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.TICKET_RESPOND)),
) -> TicketDetail:
    ticket = services.get_ticket_or_404(db, ticket_id)
    ticket = services.forward_ticket(db, ticket, actor, payload.to_user_id, payload.note)
    return _detail(ticket)


@router.post("/{ticket_id}/cancel", response_model=TicketDetail)
def cancel_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> TicketDetail:
    ticket = services.get_ticket_or_404(db, ticket_id)
    ticket = services.cancel_ticket(db, ticket, actor)
    return _detail(ticket)


# ---------------------------------------------------------------------------
# IT staff directory — used by the assignee picker
# ---------------------------------------------------------------------------
staff_router = APIRouter(prefix="/it-support", tags=["IT Support"])


@staff_router.get("/staff", response_model=list[UserSummary])
def list_it_staff(
    q: str | None = Query(None, max_length=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[UserSummary]:
    """List users who can be assigned a ticket (holders of ticket:respond)."""
    return [
        UserSummary(id=u.id, username=u.username, full_name=u.full_name)
        for u in services.list_it_staff(db, q=q)
    ]
