from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.modules.request.models import (
    RecipientPool,
    Request,
    RequestNotificationConfig,
    RequestOverdueNotification,
    RequestStatus,
    RequestStatusHistory,
    TERMINAL_STATUSES,
)
from app.modules.users.models import Role, User
from app.modules.notification.services import notify_users_and_push

ADMIN_ROLE = "admin"
TEACHER_ROLE = "teacher"
STUDENT_ROLE = "student"
STAFF_ROLE = "staff"


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------
# (from_status, to_status) -> actor role required: "creator" | "recipient"
TRANSITIONS: dict[tuple[str, str], str] = {
    (RequestStatus.CREATED.value, RequestStatus.VIEWED.value): "recipient",
    (RequestStatus.CREATED.value, RequestStatus.CANCELED.value): "creator",
    (RequestStatus.VIEWED.value, RequestStatus.RETURNED.value): "recipient",
    (RequestStatus.VIEWED.value, RequestStatus.RESOLVED.value): "recipient",
    (RequestStatus.VIEWED.value, RequestStatus.APPROVED.value): "recipient",
    (RequestStatus.VIEWED.value, RequestStatus.CANCELED.value): "creator",
    (RequestStatus.RETURNED.value, RequestStatus.EDITED.value): "creator",
    (RequestStatus.RETURNED.value, RequestStatus.CANCELED.value): "creator",
    (RequestStatus.EDITED.value, RequestStatus.VIEWED.value): "recipient",
    (RequestStatus.EDITED.value, RequestStatus.RETURNED.value): "recipient",
    (RequestStatus.EDITED.value, RequestStatus.RESOLVED.value): "recipient",
    (RequestStatus.EDITED.value, RequestStatus.APPROVED.value): "recipient",
    (RequestStatus.EDITED.value, RequestStatus.CANCELED.value): "creator",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_admin(user: User) -> bool:
    return user.has_role(ADMIN_ROLE)


def _is_teacher(user: User) -> bool:
    return user.has_role(TEACHER_ROLE)


def _is_student(user: User) -> bool:
    return user.has_role(STUDENT_ROLE)


def _can_view(req: Request, user: User) -> bool:
    if _is_admin(user):
        return True
    if user.id == req.created_by_id:
        return True
    if user.id == req.current_recipient_id:
        return True
    if (
        req.recipient_pool == RecipientPool.TEACHERS.value
        and req.current_recipient_id is None
        and _is_teacher(user)
    ):
        return True
    return False


def _is_creator(req: Request, user: User) -> bool:
    return user.id == req.created_by_id


def _is_current_recipient(req: Request, user: User) -> bool:
    return req.current_recipient_id is not None and user.id == req.current_recipient_id


def _record_history(
    db: Session,
    request: Request,
    actor_id: int | None,
    from_status: str | None,
    to_status: str,
    note: str | None = None,
    forwarded_to_id: int | None = None,
) -> RequestStatusHistory:
    entry = RequestStatusHistory(
        request_id=request.id,
        actor_id=actor_id,
        from_status=from_status,
        to_status=to_status,
        note=note,
        forwarded_to_id=forwarded_to_id,
    )
    db.add(entry)
    return entry


def get_request_or_404(db: Session, request_id: UUID) -> Request:
    req = db.get(Request, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return req


def first_active_admin_id(db: Session) -> int | None:
    """Return the id of the first active admin, used to route system requests."""
    stmt = (
        select(User.id)
        .join(User.roles)
        .where(User.is_active.is_(True), Role.name == ADMIN_ROLE)
        .order_by(User.id)
    )
    return db.execute(stmt).scalars().first()


def _sync_linked_profile_mod_request(db: Session, req: Request) -> None:
    """Propagate a request's terminal outcome to a linked profile change.

    Imported lazily to avoid a circular import between the request and profile
    modules. Commits the profile change within the same session.
    """
    from app.modules.profile.services import apply_request_status_to_profile_mod

    if apply_request_status_to_profile_mod(db, req.id, req.status):
        db.commit()

async def push_notification(current_user, id, purpose, description, recipient_ids) : 
    sender_full_name = getattr(current_user, "full_name", None) or getattr(current_user, "username", "Someone")
    
    now = datetime.now(timezone.utc)
    next_times = [now + timedelta(minutes=1), now + timedelta(minutes=2)]
    #next_times = [now + timedelta(hours=1), now + timedelta(hours=2)]
    await notify_users_and_push(
        recipient_ids,
        type="request.new_message",
        source_module="request",
        source_id=str(id),
        link="/communication-reporting/requests",
        title=f"{sender_full_name}:{purpose}",
        body=description,
        payload={},
        next_notification_times=next_times,
    )    

# ---------------------------------------------------------------------------
# Create / read
# ---------------------------------------------------------------------------
async def create_request(
    db: Session,
    actor: User,
    purpose: str,
    description: str,
    recipient_id: int | None,
    *,
    assignee_id: int | None = None,
) -> Request:
    recipient_ids: list[int] = []

    if assignee_id is not None:
        # System-initiated request assigned to a specific user (e.g. profile
        # change requests routed to an admin), regardless of the actor's role.
        recipient = db.get(User, assignee_id)
        if recipient is None or not recipient.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipient not found or inactive",
            )
        new_request = Request(
            purpose=purpose,
            description=description,
            status=RequestStatus.CREATED.value,
            created_by_id=actor.id,
            current_recipient_id=recipient.id,
            original_recipient_id=recipient.id,
            recipient_pool=None,
        )
        recipient_ids = [recipient.id]
    elif _is_student(actor) and not (_is_admin(actor) or _is_teacher(actor)):
        # Student → teacher pool. Recipient picker is disabled client-side; ignore any value.
        new_request = Request(
            purpose=purpose,
            description=description,
            status=RequestStatus.CREATED.value,
            created_by_id=actor.id,
            current_recipient_id=None,
            original_recipient_id=None,
            recipient_pool=RecipientPool.TEACHERS.value,
        )
        # Notify all active teachers about the pooled request.
        stmt = (
            select(User.id)
            .join(User.roles)
            .where(User.is_active.is_(True), Role.name == TEACHER_ROLE)
        )
        recipient_ids = list(db.execute(stmt).scalars().all())
    else:
        if recipient_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="recipient_id is required",
            )
        recipient = db.get(User, recipient_id)
        if recipient is None or not recipient.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipient not found or inactive",
            )
        new_request = Request(
            purpose=purpose,
            description=description,
            status=RequestStatus.CREATED.value,
            created_by_id=actor.id,
            current_recipient_id=recipient.id,
            original_recipient_id=recipient.id,
            recipient_pool=None,
        )
        recipient_ids = [recipient.id]

    db.add(new_request)
    db.flush()
    _record_history(db, new_request, actor.id, None, RequestStatus.CREATED.value)
    db.commit()
    db.refresh(new_request)

    if recipient_ids:
        await push_notification(actor, new_request.id, purpose, new_request.description, recipient_ids)

    return new_request


def get_request_for_user(db: Session, request_id: UUID, user: User) -> Request:
    req = get_request_or_404(db, request_id)
    if not _can_view(req, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Stamp viewed_at + transition created→viewed only when the assigned recipient views.
    if (
        _is_current_recipient(req, user)
        and req.status == RequestStatus.CREATED.value
    ):
        _transition(db, req, user, RequestStatus.VIEWED.value)
        req.viewed_at = _now()
        db.commit()
        db.refresh(req)
    return req


def list_requests(
    db: Session,
    user: User,
    box: str = "inbox",
    status_filter: str | None = None,
    q: str | None = None,
) -> list[Request]:
    stmt = select(Request)

    if box == "sent":
        stmt = stmt.where(Request.created_by_id == user.id)
    elif box == "unclaimed":
        if not (_is_teacher(user) or _is_admin(user)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        stmt = stmt.where(
            and_(
                Request.recipient_pool == RecipientPool.TEACHERS.value,
                Request.current_recipient_id.is_(None),
            )
        )
    else:  # inbox
        if _is_admin(user):
            stmt = stmt.where(
                or_(
                    Request.current_recipient_id == user.id,
                    and_(
                        Request.recipient_pool == RecipientPool.TEACHERS.value,
                        Request.current_recipient_id.is_(None),
                    ),
                )
            )
        elif _is_teacher(user):
            stmt = stmt.where(
                or_(
                    Request.current_recipient_id == user.id,
                    and_(
                        Request.recipient_pool == RecipientPool.TEACHERS.value,
                        Request.current_recipient_id.is_(None),
                    ),
                )
            )
        else:
            stmt = stmt.where(Request.current_recipient_id == user.id)

    if status_filter:
        stmt = stmt.where(Request.status == status_filter)
    if q:
        stmt = stmt.where(Request.purpose.ilike(f"%{q}%"))

    stmt = stmt.order_by(Request.updated_at.desc())
    return list(db.execute(stmt).scalars().all())


# ---------------------------------------------------------------------------
# Transitions
# ---------------------------------------------------------------------------
def _transition(
    db: Session,
    req: Request,
    actor: User,
    to_status: str,
    note: str | None = None,
) -> None:
    pair = (req.status, to_status)
    role = TRANSITIONS.get(pair)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Illegal transition: {req.status} → {to_status}",
        )

    if role == "creator":
        if not _is_creator(req, actor):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the creator may perform this action")
    elif role == "recipient":
        if req.current_recipient_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Claim required before acting on a pooled request",
            )
        if not _is_current_recipient(req, actor) and not _is_admin(actor):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the current recipient may perform this action")

    _record_history(db, req, actor.id, req.status, to_status, note=note)
    req.status = to_status
    if to_status in TERMINAL_STATUSES:
        req.resolved_at = _now()


def claim(db: Session, req: Request, actor: User) -> Request:
    if not (_is_teacher(actor) or _is_admin(actor)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only teachers or admins may claim a pooled request")
    if req.recipient_pool is None or req.current_recipient_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request is not in a claimable state")

    req.current_recipient_id = actor.id
    req.original_recipient_id = req.original_recipient_id or actor.id
    req.recipient_pool = None
    req.viewed_at = _now()
    _record_history(db, req, actor.id, req.status, RequestStatus.VIEWED.value, note="Claimed from teacher pool")
    req.status = RequestStatus.VIEWED.value
    db.commit()
    db.refresh(req)
    return req


def cancel(db: Session, req: Request, actor: User, note: str | None) -> Request:
    if not _is_creator(req, actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the creator may cancel")
    if req.status in TERMINAL_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request is already terminal")
    _record_history(db, req, actor.id, req.status, RequestStatus.CANCELED.value, note=note)
    req.status = RequestStatus.CANCELED.value
    req.resolved_at = _now()
    db.commit()
    db.refresh(req)
    _sync_linked_profile_mod_request(db, req)
    return req


def return_to_creator(db: Session, req: Request, actor: User, note: str) -> Request:
    _transition(db, req, actor, RequestStatus.RETURNED.value, note=note)
    req.return_reason = note
    db.commit()
    db.refresh(req)
    return req


def resolve(db: Session, req: Request, actor: User, note: str | None) -> Request:
    _transition(db, req, actor, RequestStatus.RESOLVED.value, note=note)
    db.commit()
    db.refresh(req)
    _sync_linked_profile_mod_request(db, req)
    return req


def approve(db: Session, req: Request, actor: User, note: str | None) -> Request:
    _transition(db, req, actor, RequestStatus.APPROVED.value, note=note)
    db.commit()
    db.refresh(req)
    _sync_linked_profile_mod_request(db, req)
    return req


def edit(
    db: Session,
    req: Request,
    actor: User,
    purpose: str,
    description: str,
) -> Request:
    if not _is_creator(req, actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the creator may edit")
    if req.status != RequestStatus.RETURNED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Edit is only allowed while status is 'returned'",
        )
    req.purpose = purpose
    req.description = description
    _record_history(db, req, actor.id, req.status, RequestStatus.EDITED.value)
    req.status = RequestStatus.EDITED.value
    req.viewed_at = None
    db.commit()
    db.refresh(req)
    return req


def forward(
    db: Session,
    req: Request,
    actor: User,
    new_recipient_id: int,
    note: str | None,
) -> Request:
    if not _is_current_recipient(req, actor) and not _is_admin(actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the current recipient may forward")
    if not (_is_teacher(actor) or _is_admin(actor)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forwarding requires teacher or admin role")
    if req.status in TERMINAL_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot forward a terminal request")
    if new_recipient_id == req.current_recipient_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already assigned to this user")
    if new_recipient_id == req.created_by_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot forward to the creator")
    new_recipient = db.get(User, new_recipient_id)
    if new_recipient is None or not new_recipient.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Recipient not found or inactive")

    req.current_recipient_id = new_recipient.id
    _record_history(
        db, req, actor.id, req.status, req.status, note=note, forwarded_to_id=new_recipient.id
    )
    db.commit()
    db.refresh(req)
    return req


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
def get_config(db: Session) -> RequestNotificationConfig:
    cfg = db.get(RequestNotificationConfig, 1)
    if cfg is None:
        cfg = RequestNotificationConfig(id=1, overdue_after_days=3)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def update_config(db: Session, actor: User, overdue_after_days: int) -> RequestNotificationConfig:
    cfg = get_config(db)
    cfg.overdue_after_days = overdue_after_days
    cfg.updated_by_id = actor.id
    db.commit()
    db.refresh(cfg)
    return cfg


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
def list_overdue_notifications(db: Session, admin: User) -> list[RequestOverdueNotification]:
    stmt = (
        select(RequestOverdueNotification)
        .where(RequestOverdueNotification.admin_id == admin.id)
        .order_by(RequestOverdueNotification.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def mark_notification_read(
    db: Session, admin: User, notification_id: int
) -> RequestOverdueNotification:
    note = db.get(RequestOverdueNotification, notification_id)
    if note is None or note.admin_id != admin.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    if note.read_at is None:
        note.read_at = _now()
        db.commit()
        db.refresh(note)
    return note


# ---------------------------------------------------------------------------
# Overdue scan (called by scheduler)
# ---------------------------------------------------------------------------
def _active_admin_ids(db: Session) -> list[int]:
    stmt = (
        select(User.id)
        .join(User.roles)
        .where(User.is_active.is_(True), Role.name == ADMIN_ROLE)
    )
    return list(db.execute(stmt).scalars().all())


def scan_overdue(db: Session) -> int:
    """Insert overdue notifications for unresolved requests past the threshold.

    Returns the number of overdue requests that were notified.
    Idempotent via Request.overdue_notified_at — a request is notified only once.
    """
    cfg = get_config(db)
    cutoff = _now() - timedelta(days=cfg.overdue_after_days)

    stmt = select(Request).where(
        Request.status.notin_(list(TERMINAL_STATUSES)),
        Request.created_at < cutoff,
        Request.overdue_notified_at.is_(None),
    )
    overdue = list(db.execute(stmt).scalars().all())
    if not overdue:
        return 0

    admin_ids = _active_admin_ids(db)
    if not admin_ids:
        return 0

    now = _now()
    for req in overdue:
        for admin_id in admin_ids:
            db.add(RequestOverdueNotification(request_id=req.id, admin_id=admin_id))
        req.overdue_notified_at = now

    db.commit()
    return len(overdue)


__all__ = [
    "TRANSITIONS",
    "approve",
    "get_request_or_404",
    "cancel",
    "claim",
    "create_request",
    "edit",
    "forward",
    "get_config",
    "get_request_for_user",
    "list_overdue_notifications",
    "list_requests",
    "mark_notification_read",
    "resolve",
    "return_to_creator",
    "scan_overdue",
    "update_config",
]
