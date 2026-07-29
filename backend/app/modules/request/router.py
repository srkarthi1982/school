from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import PermissionCode
from app.modules.request import services
from app.modules.request.models import Request as RequestModel
from app.modules.request.schemas import (
    BoxLiteral,
    CreateRequestPayload,
    EditRequestPayload,
    ForwardPayload,
    OverdueNotificationItem,
    OverdueNotificationListResponse,
    RequestConfigResponse,
    RequestDetail,
    RequestListResponse,
    RequestSummary,
    ReturnPayload,
    StatusHistoryEntry,
    StatusLiteral,
    TransitionPayload,
    UpdateConfigPayload,
    UserSummary,
)
from app.modules.users.models import User

router = APIRouter(prefix="/requests", tags=["Requests"])


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------
def _user_summary(user: User | None) -> UserSummary | None:
    if user is None:
        return None
    return UserSummary(id=user.id, username=user.username, full_name=user.full_name)


def _summary(req: RequestModel) -> RequestSummary:
    return RequestSummary(
        id=req.id,
        purpose=req.purpose,
        status=req.status,
        created_by=_user_summary(req.creator),
        current_recipient=_user_summary(req.current_recipient),
        recipient_pool=req.recipient_pool,
        created_at=req.created_at,
        updated_at=req.updated_at,
        viewed_at=req.viewed_at,
        resolved_at=req.resolved_at,
    )


def _detail(req: RequestModel) -> RequestDetail:
    history = [
        StatusHistoryEntry(
            id=h.id,
            actor=_user_summary(h.actor),
            from_status=h.from_status,
            to_status=h.to_status,
            note=h.note,
            forwarded_to=_user_summary(h.forwarded_to),
            created_at=h.created_at,
        )
        for h in req.history
    ]
    return RequestDetail(
        id=req.id,
        purpose=req.purpose,
        description=req.description,
        status=req.status,
        created_by=_user_summary(req.creator),
        current_recipient=_user_summary(req.current_recipient),
        recipient_pool=req.recipient_pool,
        return_reason=req.return_reason,
        created_at=req.created_at,
        updated_at=req.updated_at,
        viewed_at=req.viewed_at,
        resolved_at=req.resolved_at,
        history=history,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("", response_model=RequestDetail, status_code=status.HTTP_201_CREATED)
async def create_request(
    payload: CreateRequestPayload,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_CREATE)),
) -> RequestDetail:
    req = await services.create_request(
        db, actor, payload.purpose, payload.description, payload.recipient_id
    )
    return _detail(req)


@router.get("", response_model=RequestListResponse)
def list_requests(
    box: BoxLiteral = Query("inbox"),
    status_filter: StatusLiteral | None = Query(None, alias="status"),
    q: str | None = Query(None, max_length=255),
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_READ_OWN)),
) -> RequestListResponse:
    items = services.list_requests(db, actor, box=box, status_filter=status_filter, q=q)
    return RequestListResponse(items=[_summary(r) for r in items])


@router.get("/config", response_model=RequestConfigResponse)
def read_config(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> RequestConfigResponse:
    cfg = services.get_config(db)
    return RequestConfigResponse(
        overdue_after_days=cfg.overdue_after_days, updated_at=cfg.updated_at
    )


@router.put("/config", response_model=RequestConfigResponse)
def update_config(
    payload: UpdateConfigPayload,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_CONFIG)),
) -> RequestConfigResponse:
    cfg = services.update_config(db, actor, payload.overdue_after_days)
    return RequestConfigResponse(
        overdue_after_days=cfg.overdue_after_days, updated_at=cfg.updated_at
    )


@router.get("/notifications", response_model=OverdueNotificationListResponse)
def list_notifications(
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_CONFIG)),
) -> OverdueNotificationListResponse:
    rows = services.list_overdue_notifications(db, actor)
    items = [
        OverdueNotificationItem(
            id=row.id,
            request_id=row.request_id,
            request_purpose=row.request.purpose if row.request else "",
            request_status=row.request.status if row.request else "created",
            created_at=row.created_at,
            read_at=row.read_at,
        )
        for row in rows
    ]
    return OverdueNotificationListResponse(items=items)


@router.post("/notifications/{notification_id}/read", response_model=OverdueNotificationItem)
def read_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_CONFIG)),
) -> OverdueNotificationItem:
    row = services.mark_notification_read(db, actor, notification_id)
    return OverdueNotificationItem(
        id=row.id,
        request_id=row.request_id,
        request_purpose=row.request.purpose if row.request else "",
        request_status=row.request.status if row.request else "created",
        created_at=row.created_at,
        read_at=row.read_at,
    )


@router.get("/{request_id}", response_model=RequestDetail)
def get_request(
    request_id: UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_READ_OWN)),
) -> RequestDetail:
    req = services.get_request_for_user(db, request_id, actor)
    return _detail(req)


@router.patch("/{request_id}", response_model=RequestDetail)
def edit_request(
    request_id: UUID,
    payload: EditRequestPayload,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_CREATE)),
) -> RequestDetail:
    req = services.get_request_or_404(db, request_id)
    req = services.edit(db, req, actor, payload.purpose, payload.description)
    return _detail(req)


@router.post("/{request_id}/claim", response_model=RequestDetail)
def claim_request(
    request_id: UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_RESPOND)),
) -> RequestDetail:
    req = services.get_request_or_404(db, request_id)
    req = services.claim(db, req, actor)
    return _detail(req)


@router.post("/{request_id}/cancel", response_model=RequestDetail)
def cancel_request(
    request_id: UUID,
    payload: TransitionPayload | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_CREATE)),
) -> RequestDetail:
    req = services.get_request_or_404(db, request_id)
    note = payload.note if payload else None
    req = services.cancel(db, req, actor, note)
    return _detail(req)


@router.post("/{request_id}/return", response_model=RequestDetail)
def return_request(
    request_id: UUID,
    payload: ReturnPayload,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_RESPOND)),
) -> RequestDetail:
    req = services.get_request_or_404(db, request_id)
    req = services.return_to_creator(db, req, actor, payload.note)
    return _detail(req)


@router.post("/{request_id}/resolve", response_model=RequestDetail)
def resolve_request(
    request_id: UUID,
    payload: TransitionPayload | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_RESPOND)),
) -> RequestDetail:
    req = services.get_request_or_404(db, request_id)
    note = payload.note if payload else None
    req = services.resolve(db, req, actor, note)
    return _detail(req)


@router.post("/{request_id}/approve", response_model=RequestDetail)
def approve_request(
    request_id: UUID,
    payload: TransitionPayload | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_RESPOND)),
) -> RequestDetail:
    req = services.get_request_or_404(db, request_id)
    note = payload.note if payload else None
    req = services.approve(db, req, actor, note)
    return _detail(req)


@router.post("/{request_id}/forward", response_model=RequestDetail)
def forward_request(
    request_id: UUID,
    payload: ForwardPayload,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission(PermissionCode.REQUEST_FORWARD)),
) -> RequestDetail:
    req = services.get_request_or_404(db, request_id)
    req = services.forward(db, req, actor, payload.recipient_id, payload.note)
    return _detail(req)
