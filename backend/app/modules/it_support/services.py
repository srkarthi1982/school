from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.permissions import PermissionCode
from app.modules.it_support.models import (
    TERMINAL_STATUSES,
    Ticket,
    TicketHistory,
    TicketStatus,
)
from app.modules.users.models import User

_APPROVE = PermissionCode.TICKET_APPROVE.value
_RESPOND = PermissionCode.TICKET_RESPOND.value
_VIEW_ALL = PermissionCode.TICKET_VIEW_ALL.value
_ADMIN_FULL = PermissionCode.ADMIN_FULL.value


# ---------------------------------------------------------------------------
# Role / permission helpers
# ---------------------------------------------------------------------------
def _perms(user: User) -> set[str]:
    return {p.code for r in user.roles for p in r.permissions}


def _is_approver(user: User) -> bool:
    perms = _perms(user)
    return _APPROVE in perms or _ADMIN_FULL in perms


def _is_it_staff(user: User) -> bool:
    perms = _perms(user)
    return _RESPOND in perms or _ADMIN_FULL in perms


def _can_view_all(user: User) -> bool:
    perms = _perms(user)
    return _VIEW_ALL in perms or _ADMIN_FULL in perms


def _is_creator(ticket: Ticket, user: User) -> bool:
    return ticket.created_by_id is not None and user.id == ticket.created_by_id


def _is_assignee(ticket: Ticket, user: User) -> bool:
    return ticket.assigned_to_id is not None and user.id == ticket.assigned_to_id


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _record_history(
    db: Session,
    ticket: Ticket,
    actor_id: int | None,
    from_status: str | None,
    to_status: str,
    note: str | None = None,
    forwarded_to_id: int | None = None,
) -> TicketHistory:
    entry = TicketHistory(
        ticket_id=ticket.id,
        actor_id=actor_id,
        from_status=from_status,
        to_status=to_status,
        note=note,
        forwarded_to_id=forwarded_to_id,
    )
    db.add(entry)
    return entry


def get_ticket_or_404(db: Session, ticket_id: int) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket


def _resolve_target(db: Session, user_id: int) -> User:
    target = db.get(User, user_id)
    if target is None or not target.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target user not found or inactive",
        )
    return target


# ---------------------------------------------------------------------------
# Create / read
# ---------------------------------------------------------------------------
def create_ticket(db: Session, actor: User, title: str, description: str) -> Ticket:
    ticket = Ticket(
        title=title,
        description=description,
        status=TicketStatus.SUBMITTED.value,
        created_by_id=actor.id,
        assigned_to_id=None,
    )
    db.add(ticket)
    db.flush()
    _record_history(db, ticket, actor.id, None, TicketStatus.SUBMITTED.value)
    db.commit()
    db.refresh(ticket)
    return ticket


def list_tickets(
    db: Session,
    user: User,
    box: str = "inbox",
    q: str | None = None,
) -> list[Ticket]:
    stmt = select(Ticket)

    if box == "all":
        if not _can_view_all(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif _is_approver(user):
        stmt = stmt.where(
            or_(
                Ticket.status == TicketStatus.SUBMITTED.value,
                and_(
                    Ticket.status == TicketStatus.APPROVED.value,
                    Ticket.assigned_to_id.is_(None),
                ),
            )
        )
    elif _is_it_staff(user):
        stmt = stmt.where(
            or_(
                and_(
                    Ticket.status == TicketStatus.APPROVED.value,
                    Ticket.assigned_to_id.is_(None),
                ),
                and_(
                    Ticket.assigned_to_id == user.id,
                    Ticket.status != TicketStatus.RESOLVED.value,
                ),
            )
        )
    else:  # requester — only own tickets
        stmt = stmt.where(Ticket.created_by_id == user.id)

    if q:
        stmt = stmt.where(Ticket.title.ilike(f"%{q}%"))

    stmt = stmt.order_by(Ticket.updated_at.desc())
    return list(db.execute(stmt).scalars().all())


def get_ticket_for_user(db: Session, ticket_id: int, user: User) -> Ticket:
    ticket = get_ticket_or_404(db, ticket_id)
    if _can_view_all(user) or _is_approver(user) or _is_it_staff(user):
        return ticket
    if _is_creator(ticket, user) or _is_assignee(ticket, user):
        return ticket
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


# ---------------------------------------------------------------------------
# Workflow transitions
# ---------------------------------------------------------------------------
def approve_ticket(
    db: Session, ticket: Ticket, actor: User, target_user_id: int | None
) -> Ticket:
    if not _is_approver(actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an approver may approve tickets")
    if ticket.status != TicketStatus.SUBMITTED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only submitted tickets can be approved",
        )

    prev = ticket.status
    if target_user_id is not None:
        target = _resolve_target(db, target_user_id)
        ticket.assigned_to_id = target.id
        ticket.status = TicketStatus.VIEWED.value
        _record_history(
            db, ticket, actor.id, prev, TicketStatus.VIEWED.value,
            note=f"Approved & assigned to {target.full_name}",
            forwarded_to_id=target.id,
        )
    else:
        ticket.assigned_to_id = None
        ticket.status = TicketStatus.APPROVED.value
        _record_history(
            db, ticket, actor.id, prev, TicketStatus.APPROVED.value,
            note="Approved by manager. Added to IT pool.",
        )
    db.commit()
    db.refresh(ticket)
    return ticket


def decline_ticket(db: Session, ticket: Ticket, actor: User, reason: str) -> Ticket:
    if not _is_approver(actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an approver may decline tickets")
    if ticket.status != TicketStatus.SUBMITTED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only submitted tickets can be declined",
        )

    prev = ticket.status
    ticket.status = TicketStatus.DECLINED.value
    ticket.decline_reason = reason
    _record_history(db, ticket, actor.id, prev, TicketStatus.DECLINED.value, note=reason)
    db.commit()
    db.refresh(ticket)
    return ticket


def claim_ticket(db: Session, ticket: Ticket, actor: User) -> Ticket:
    if not _is_it_staff(actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only IT staff may claim tickets")
    if ticket.status != TicketStatus.APPROVED.value or ticket.assigned_to_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ticket is not in a claimable state",
        )

    prev = ticket.status
    ticket.assigned_to_id = actor.id
    ticket.status = TicketStatus.VIEWED.value
    _record_history(db, ticket, actor.id, prev, TicketStatus.VIEWED.value)
    db.commit()
    db.refresh(ticket)
    return ticket


def resolve_ticket(db: Session, ticket: Ticket, actor: User, note: str) -> Ticket:
    if not (_is_it_staff(actor) and _is_assignee(ticket, actor)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned IT staff may resolve this ticket",
        )
    if ticket.status in TERMINAL_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ticket is already closed")

    prev = ticket.status
    ticket.status = TicketStatus.RESOLVED.value
    ticket.resolution_notes = note
    _record_history(db, ticket, actor.id, prev, TicketStatus.RESOLVED.value, note=note)
    db.commit()
    db.refresh(ticket)
    return ticket


def forward_ticket(
    db: Session, ticket: Ticket, actor: User, to_user_id: int, note: str | None
) -> Ticket:
    if not (_is_it_staff(actor) and _is_assignee(ticket, actor)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned IT staff may forward this ticket",
        )
    if ticket.status in TERMINAL_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ticket is already closed")

    target = _resolve_target(db, to_user_id)
    if target.id == ticket.assigned_to_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket is already assigned to this user",
        )

    prev = ticket.status
    ticket.assigned_to_id = target.id
    _record_history(
        db, ticket, actor.id, prev, prev,
        note=note or f"Forwarded to {target.full_name}",
        forwarded_to_id=target.id,
    )
    db.commit()
    db.refresh(ticket)
    return ticket


def cancel_ticket(db: Session, ticket: Ticket, actor: User) -> Ticket:
    if not _is_creator(ticket, actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the ticket creator may cancel it",
        )
    if ticket.status in TERMINAL_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ticket is already closed")

    prev = ticket.status
    ticket.status = TicketStatus.RESOLVED.value
    _record_history(
        db, ticket, actor.id, prev, TicketStatus.RESOLVED.value, note="Canceled by user."
    )
    db.commit()
    db.refresh(ticket)
    return ticket


# ---------------------------------------------------------------------------
# Directory
# ---------------------------------------------------------------------------
def list_it_staff(db: Session, q: str | None = None, limit: int = 50) -> list[User]:
    """Active users eligible to handle tickets — i.e. whose effective
    permissions include ``ticket:respond`` (admins included via ``admin:full``).

    This mirrors ``_is_it_staff`` so the assignee picker matches authorization.
    """
    from app.modules.profile.models import Profile
    from app.modules.users.models import Permission, Role

    stmt = (
        select(User)
        .join(User.roles)
        .join(Role.permissions)
        .options(selectinload(User.profile))
        .where(
            User.is_active.is_(True),
            Permission.code.in_([_RESPOND, _ADMIN_FULL]),
        )
    )
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.join(User.profile).where(
            or_(
                Profile.first_name.ilike(pattern),
                Profile.middle_name.ilike(pattern),
                Profile.last_name.ilike(pattern),
                User.username.ilike(pattern),
            )
        )
    stmt = stmt.distinct().order_by(User.username).limit(limit)
    return list(db.execute(stmt).scalars().all())


__all__ = [
    "approve_ticket",
    "cancel_ticket",
    "claim_ticket",
    "create_ticket",
    "decline_ticket",
    "forward_ticket",
    "get_ticket_for_user",
    "get_ticket_or_404",
    "list_it_staff",
    "list_tickets",
    "resolve_ticket",
]
