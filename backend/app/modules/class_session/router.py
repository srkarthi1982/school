import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.core.schemas import apply_sort, paginate
from app.modules.users.models import Permission, Role, User

from .livekit_client import (
    count_participants,
    delete_room,
    ensure_room,
    mint_join_token,
    receive_webhook,
    start_room_composite_recording,
    stop_recording,
)
from .models import ClassSession, ClassSessionRecording
from app.modules.notification.services import notify_users_and_push

from .schemas import (
    BreakoutBroadcastRequest,
    BreakoutBroadcastResponse,
    BreakoutInviteeInfo,
    BreakoutSummary,
    BreakoutToken,
    ClassSessionCreate,
    ClassSessionRecordingResponse,
    ClassSessionResponse,
    ClassSessionUpdate,
    CloseBreakoutResponse,
    CreateBreakoutRequest,
    CreateBreakoutResponse,
    JoinTokenResponse,
    MoveBreakoutRequest,
    MoveBreakoutResponse,
    SessionStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/class-sessions", tags=["Class Sessions"])


def _generate_room_name() -> str:
    """Unique LiveKit room slug. 12 hex chars => 48 bits of entropy."""
    return f"cs-{secrets.token_hex(6)}"


def _is_owner_or_admin(session: ClassSession, user: User) -> bool:
    return session.host_user_id == user.id or user.has_role("admin")


def _users_with_join_permission(db: Session, user_ids: list[int]) -> list[User]:
    """Return only the users from `user_ids` who actually carry a role
    granting class_session:join (or admin:full).

    Used by the breakout invite path so a host can't escalate a random
    user_id into the LiveKit room by smuggling them onto the
    participant_user_ids list. Without this, /breakouts would mint a
    valid LiveKit token for any user the host names regardless of their
    role permissions.
    """
    if not user_ids:
        return []
    return (
        db.query(User)
        .join(User.roles)
        .join(Role.permissions)
        .filter(
            User.id.in_(user_ids),
            Permission.code.in_(
                [
                    PermissionCode.CLASS_SESSION_JOIN.value,
                    PermissionCode.ADMIN_FULL.value,
                ]
            ),
        )
        .distinct()
        .all()
    )


@router.get("/", response_model=SuccessResponse[list[ClassSessionResponse]])
def list_class_sessions(
    status: SessionStatus | None = None,
    host_user_id: int | None = None,
    q: str | None = Query(None, description="Substring match on title"),
    sort_by: str | None = Query(None),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_READ)),
):
    query = db.query(ClassSession)
    if status:
        query = query.filter(ClassSession.status == status)
    if host_user_id:
        query = query.filter(ClassSession.host_user_id == host_user_id)
    if q:
        query = query.filter(ClassSession.title.ilike(f"%{q}%"))
    query = apply_sort(query, ClassSession, sort_by or "scheduled_start", sort_order)
    return paginate(query, page, page_size)


@router.get("/{session_id}", response_model=SuccessResponse[ClassSessionResponse])
def get_class_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_READ)),
):
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Class session not found")
    return ok(session)


@router.post("/", response_model=SuccessResponse[ClassSessionResponse], status_code=201)
def create_class_session(
    data: ClassSessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_WRITE)),
):
    if data.scheduled_end <= data.scheduled_start:
        raise HTTPException(status_code=422, detail="scheduled_end must be after scheduled_start")
    session = ClassSession(
        title=data.title,
        description=data.description,
        host_user_id=user.id,
        livekit_room_name=_generate_room_name(),
        status="SCHEDULED",
        scheduled_start=data.scheduled_start,
        scheduled_end=data.scheduled_end,
        max_participants=data.max_participants,
        participant_user_ids=data.participant_user_ids or None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return ok(session)


@router.put("/{session_id}", response_model=SuccessResponse[ClassSessionResponse])
def update_class_session(
    session_id: int,
    data: ClassSessionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_WRITE)),
):
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Class session not found")
    if not _is_owner_or_admin(session, user):
        raise HTTPException(status_code=403, detail="Only the host can update this session")
    if session.status != "SCHEDULED":
        raise HTTPException(status_code=409, detail="Only SCHEDULED sessions can be edited")
    if session.version != data.version:
        raise HTTPException(status_code=409, detail="Resource was modified by another request. Reload and retry.")
    if data.scheduled_end <= data.scheduled_start:
        raise HTTPException(status_code=422, detail="scheduled_end must be after scheduled_start")
    for key, value in data.model_dump(exclude={"version"}).items():
        setattr(session, key, value)
    db.commit()
    db.refresh(session)
    return ok(session)


@router.delete("/{session_id}", status_code=204)
def delete_class_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_WRITE)),
):
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Class session not found")
    if not _is_owner_or_admin(session, user):
        raise HTTPException(status_code=403, detail="Only the host can delete this session")
    if session.status not in ("SCHEDULED", "CANCELLED"):
        raise HTTPException(status_code=409, detail="Only SCHEDULED or CANCELLED sessions can be deleted")
    db.delete(session)
    db.commit()


@router.post("/{session_id}/start", response_model=SuccessResponse[ClassSessionResponse])
async def start_class_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_HOST)),
):
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Class session not found")
    if not _is_owner_or_admin(session, user):
        raise HTTPException(status_code=403, detail="Only the host can start this session")
    if session.status != "SCHEDULED":
        raise HTTPException(status_code=409, detail=f"Cannot start a session in {session.status} state")
    # G9: host may only have one LIVE session at a time. Stops accidental
    # multi-class hosting and keeps the list clean.
    other_live = (
        db.query(ClassSession.id)
        .filter(
            ClassSession.host_user_id == session.host_user_id,
            ClassSession.status == "LIVE",
            ClassSession.id != session.id,
        )
        .first()
    )
    if other_live:
        raise HTTPException(
            status_code=409,
            detail="You already have another LIVE session — end it before starting this one.",
        )
    # G4: pre-create the LiveKit room with the configured max so the SFU
    # hard-rejects over-cap joiners. The /join soft check is a defensive
    # second layer.
    await ensure_room(
        name=session.livekit_room_name,
        max_participants=session.max_participants,
    )
    session.status = "LIVE"
    session.actual_start = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return ok(session)


@router.post("/{session_id}/end", response_model=SuccessResponse[ClassSessionResponse])
async def end_class_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_HOST)),
):
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Class session not found")
    if not _is_owner_or_admin(session, user):
        raise HTTPException(status_code=403, detail="Only the host can end this session")
    if session.status != "LIVE":
        raise HTTPException(status_code=409, detail=f"Cannot end a session in {session.status} state")
    now = datetime.now(timezone.utc)
    session.status = "ENDED"
    session.actual_end = now
    # G20 — cascade to any active breakout children spawned from this
    # session. /end is a hard stop, so we don't bother broadcasting
    # return tokens; invitees in breakouts get kicked along with
    # everyone else, which matches the user-visible "class over"
    # mental model.
    children = (
        db.query(ClassSession)
        .filter(
            ClassSession.parent_session_id == session.id,
            ClassSession.status == "LIVE",
        )
        .all()
    )
    for child in children:
        child.status = "ENDED"
        child.actual_end = now
    db.commit()
    db.refresh(session)
    # G8: terminate the LiveKit room so any still-connected participants
    # are kicked out. Their clients fire onDisconnected and the React
    # store cleans itself up.
    await delete_room(session.livekit_room_name)
    for child in children:
        await delete_room(child.livekit_room_name)
    return ok(session)


@router.post("/{session_id}/join", response_model=SuccessResponse[JoinTokenResponse])
async def join_class_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_JOIN)),
):
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Class session not found")
    if session.status != "LIVE":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot join a session that is {session.status}; wait for the host to start it",
        )
    # G1: per-session whitelist. NULL/empty list = open. The host and any
    # admin user always bypass the whitelist so they can never lock
    # themselves out of their own session.

    allowed = (
        not session.participant_user_ids
        or user.id in session.participant_user_ids
        or user.id == session.host_user_id
        or user.has_role("admin")
    )
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail="You are not on the participant list for this session",
        )
    # G4 soft check: count current participants in the LiveKit room before
    # minting another token. The SFU also enforces max via ensure_room()
    # at /start, so this just gives a clean 409 before we even try.
    # Host and admins bypass the cap so they can always rejoin in an
    # emergency.
    is_host_or_admin = user.id == session.host_user_id or user.has_role("admin")
    if not is_host_or_admin:
        current = await count_participants(session.livekit_room_name)
        if current >= session.max_participants:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Session is at capacity ({current}/{session.max_participants}). "
                    "Try again later."
                ),
            )
    token, expires_at = mint_join_token(
        room=session.livekit_room_name,
        identity=str(user.id),
        name=user.full_name or user.username,
        can_publish=True,
        is_host=is_host_or_admin,
    )
    return ok(
        JoinTokenResponse(
            token=token,
            ws_url=settings.LIVEKIT_URL,
            room_name=session.livekit_room_name,
            identity=str(user.id),
            expires_at=expires_at,
            is_host=is_host_or_admin,
        )
    )


@router.get(
    "/{session_id}/breakouts",
    response_model=SuccessResponse[list[BreakoutSummary]],
)
def list_breakouts(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_HOST)),
):
    """Return active breakouts spawned from this session.

    Host-only because it exposes invitee names. The frontend uses this on
    host (re)mount to re-hydrate the local breakout panel state — without
    it a page refresh wipes the host's view of breakouts they spawned
    earlier in the class.
    """
    parent = db.get(ClassSession, session_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Class session not found")
    if not _is_owner_or_admin(parent, user):
        raise HTTPException(
            status_code=403, detail="Only the host can view breakouts for this session"
        )

    children = (
        db.query(ClassSession)
        .filter(
            ClassSession.parent_session_id == session_id,
            ClassSession.status == "LIVE",
        )
        .order_by(ClassSession.id.asc())
        .all()
    )
    if not children:
        return ok([])

    # Bulk-resolve user names so we don't N+1 the DB. Identity in LiveKit
    # equals str(user.id), so the frontend can map participants to invitees
    # without a second lookup.
    all_user_ids = {uid for c in children for uid in (c.participant_user_ids or [])}
    users_by_id: dict[int, User] = {}
    if all_user_ids:
        users_by_id = {
            u.id: u
            for u in db.query(User).filter(User.id.in_(all_user_ids)).all()
        }

    summaries: list[BreakoutSummary] = []
    for child in children:
        invitees: list[BreakoutInviteeInfo] = []
        for uid in child.participant_user_ids or []:
            u = users_by_id.get(uid)
            if u is None:
                # User deleted since breakout was created; surface the id
                # so the host still sees something rather than a silent gap.
                invitees.append(
                    BreakoutInviteeInfo(user_id=uid, identity=str(uid), name=f"User #{uid}")
                )
            else:
                invitees.append(
                    BreakoutInviteeInfo(
                        user_id=u.id,
                        identity=str(u.id),
                        name=u.full_name or u.username,
                    )
                )
        summaries.append(
            BreakoutSummary(
                breakout_id=child.id,
                name=child.title,
                invitees=invitees,
                expires_at=child.expires_at,
            )
        )
    return ok(summaries)


@router.post(
    "/{session_id}/breakouts",
    response_model=SuccessResponse[CreateBreakoutResponse],
    status_code=201,
)
async def create_breakout(
    session_id: int,
    data: CreateBreakoutRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_HOST)),
):
    """Spawn a child class_session for a subset of participants of the
    parent (host-only). The response carries pre-minted LiveKit tokens
    for each invitee — the host's frontend pushes them via the
    `classroom-breakout` data-channel topic so each invitee's LiveKit
    client switches rooms transparently. The host stays in the parent
    room and can supervise (or roam by minting their own breakout token
    via /join on the child session id)."""
    parent = db.get(ClassSession, session_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Class session not found")
    if not _is_owner_or_admin(parent, user):
        raise HTTPException(status_code=403, detail="Only the host can spawn breakouts")
    if parent.status != "LIVE":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot create a breakout on a session in {parent.status} state",
        )

    requested_ids = set(data.participant_user_ids)
    # G19 — only invite users who actually have class_session:join (or
    # admin:full). Anything else would mean handing a valid LiveKit
    # token to a user the host normally can't admit to a class.
    invitees = _users_with_join_permission(db, list(requested_ids))
    allowed_ids = {u.id for u in invitees}
    forbidden = sorted(requested_ids - allowed_ids)
    if forbidden:
        raise HTTPException(
            status_code=422,
            detail=(
                "Users without class_session:join cannot be invited: "
                f"{forbidden}"
            ),
        )

    now = datetime.now(timezone.utc)
    expires_at = (
        now + timedelta(minutes=data.duration_minutes)
        if data.duration_minutes
        else None
    )
    child = ClassSession(
        title=data.name,
        description=f"Breakout of session #{parent.id}",
        host_user_id=parent.host_user_id,
        livekit_room_name=_generate_room_name(),
        status="LIVE",
        scheduled_start=now,
        scheduled_end=parent.scheduled_end,
        actual_start=now,
        # Buffer of 5 over invitees so the host can roam in if they want.
        max_participants=min(200, len(data.participant_user_ids) + 5),
        parent_session_id=parent.id,
        participant_user_ids=list({u.id for u in invitees}),
        expires_at=expires_at,
    )
    db.add(child)
    db.commit()
    db.refresh(child)

    await ensure_room(
        name=child.livekit_room_name,
        max_participants=child.max_participants,
    )

    tokens: list[BreakoutToken] = []
    for u in invitees:
        tok, exp = mint_join_token(
            room=child.livekit_room_name,
            identity=str(u.id),
            name=u.full_name or u.username,
            can_publish=True,
            is_host=False,
        )
        tokens.append(
            BreakoutToken(
                user_id=u.id,
                token=tok,
                room_name=child.livekit_room_name,
                ws_url=settings.LIVEKIT_URL,
                expires_at=exp,
            )
        )

    return ok(
        CreateBreakoutResponse(
            breakout_id=child.id,
            tokens=tokens,
            expires_at=child.expires_at,
        )
    )


@router.post(
    "/{session_id}/breakouts/{breakout_id}/close",
    response_model=SuccessResponse[CloseBreakoutResponse],
)
async def close_breakout(
    session_id: int,
    breakout_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_HOST)),
):
    """Tear down a breakout child session and push a return-to-parent
    signal to every invitee.

    Delivery uses the notification WS pipeline (cross-room) because the
    host is in the parent LiveKit room and invitees are in the breakout
    child room — the `classroom-breakout` data-channel topic the host
    publishes on cannot reach them across rooms. Each invitee's frontend
    listens for type='breakout.return' and calls /join on the parent
    session to mint a fresh token, then switchRoom. We still return
    tokens in the response for backward compatibility, but they're no
    longer the primary delivery path."""
    parent = db.get(ClassSession, session_id)
    breakout = db.get(ClassSession, breakout_id)
    if not parent or not breakout:
        raise HTTPException(status_code=404, detail="Class session or breakout not found")
    if breakout.parent_session_id != parent.id:
        raise HTTPException(
            status_code=422,
            detail="Breakout does not belong to this parent session",
        )
    if not _is_owner_or_admin(parent, user):
        raise HTTPException(status_code=403, detail="Only the host can close breakouts")
    if breakout.status != "LIVE":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot close a breakout in {breakout.status} state",
        )

    # G24 — order matters here. Mint return tokens FIRST while invitees
    # are still connected to the breakout's LiveKit room so the host's
    # frontend can data-channel-broadcast them. If we deleted the room
    # first, LiveKit would kick all invitees with reason ROOM_DELETED
    # before the broadcast, and they'd land at /:id (treated as a clean
    # disconnect) instead of switchRoom'ing back to the parent room.
    invitee_ids = breakout.participant_user_ids or []
    invitees = db.query(User).filter(User.id.in_(invitee_ids)).all()
    tokens: list[BreakoutToken] = []
    for u in invitees:
        is_invitee_host = u.id == parent.host_user_id or u.has_role("admin")
        tok, exp = mint_join_token(
            room=parent.livekit_room_name,
            identity=str(u.id),
            name=u.full_name or u.username,
            can_publish=True,
            is_host=is_invitee_host,
        )
        tokens.append(
            BreakoutToken(
                user_id=u.id,
                token=tok,
                room_name=parent.livekit_room_name,
                ws_url=settings.LIVEKIT_URL,
                expires_at=exp,
            )
        )

    breakout.status = "ENDED"
    breakout.actual_end = datetime.now(timezone.utc)
    db.commit()
    # We deliberately do NOT call delete_room on the breakout. After
    # every invitee receives the return notification and switchRoom's
    # away, LiveKit's departure_timeout (20s, configured in ensure_room)
    # tears the empty room down on its own. The room_finished webhook
    # then no-ops because the DB row is already ENDED.

    # Cross-room return signal via notification WS. Token deliberately
    # omitted from the persisted payload — the student's frontend calls
    # /join on the parent session to mint a fresh one.
    for u in invitees:
        await notify_users_and_push(
            [u.id],
            type="breakout.return",
            source_module="class_session",
            source_id=str(breakout.id),
            title="Returned to main room",
            body=f"'{breakout.title}' has ended",
            payload={
                "session_id": parent.id,
                "source_breakout_id": breakout.id,
            },
        )

    return ok(CloseBreakoutResponse(tokens=tokens))


@router.get(
    "/{session_id}/recordings",
    response_model=SuccessResponse[list[ClassSessionRecordingResponse]],
)
def list_recordings(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_READ)),
):
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Class session not found")
    recordings = (
        db.query(ClassSessionRecording)
        .filter(ClassSessionRecording.session_id == session_id)
        .order_by(ClassSessionRecording.started_at.desc())
        .all()
    )
    return ok(recordings)


@router.post(
    "/{session_id}/recordings",
    response_model=SuccessResponse[ClassSessionRecordingResponse],
    status_code=201,
)
async def start_recording(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_HOST)),
):
    """Begin a Room-Composite recording. Requires an Egress server and
    Redis to be deployed (see infra/livekit/README.md). Without them,
    this endpoint returns the LiveKit error verbatim."""
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Class session not found")
    if not _is_owner_or_admin(session, user):
        raise HTTPException(status_code=403, detail="Only the host can start recording")
    if session.status != "LIVE":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot record a session in {session.status} state",
        )
    # Forbid concurrent recordings on the same session — operators almost
    # always want one continuous file per class.
    existing_active = (
        db.query(ClassSessionRecording.id)
        .filter(
            ClassSessionRecording.session_id == session_id,
            ClassSessionRecording.status.in_(("STARTING", "ACTIVE")),
        )
        .first()
    )
    if existing_active:
        raise HTTPException(
            status_code=409,
            detail="A recording is already running for this session",
        )

    try:
        egress_id, file_path = await start_room_composite_recording(
            room_name=session.livekit_room_name,
            output_dir=settings.LIVEKIT_RECORDINGS_DIR,
        )
    except Exception as exc:
        logger.warning("start_recording failed for session=%s: %s", session_id, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Egress refused the request: {exc}",
        )

    recording = ClassSessionRecording(
        session_id=session.id,
        egress_id=egress_id,
        status="STARTING",
        started_at=datetime.now(timezone.utc),
        file_path=file_path,
    )
    db.add(recording)
    db.commit()
    db.refresh(recording)
    return ok(recording)


@router.post(
    "/{session_id}/recordings/{recording_id}/stop",
    response_model=SuccessResponse[ClassSessionRecordingResponse],
)
async def stop_recording_endpoint(
    session_id: int,
    recording_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_HOST)),
):
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Class session not found")
    if not _is_owner_or_admin(session, user):
        raise HTTPException(status_code=403, detail="Only the host can stop recording")
    recording = db.get(ClassSessionRecording, recording_id)
    if not recording or recording.session_id != session.id:
        raise HTTPException(status_code=404, detail="Recording not found for this session")
    if recording.status not in ("STARTING", "ACTIVE"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot stop a recording in {recording.status} state",
        )
    await stop_recording(recording.egress_id)
    # Final status (FINISHED / FAILED / ABORTED) lands via webhook. We
    # leave the row in its current state and just return it.
    db.refresh(recording)
    return ok(recording)


@router.post(
    "/{session_id}/breakouts/{breakout_id}/join",
    response_model=SuccessResponse[JoinTokenResponse],
)
async def join_breakout(
    session_id: int,
    breakout_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_JOIN)),
):
    """Mint a fresh LiveKit token for a specific breakout child room.

    Used by the move flow: when the host moves a student from one
    breakout to another, the student's frontend listens for the move
    notification and calls this to get a token for the target room
    without going through /join (which always joins the parent room).
    """
    parent = db.get(ClassSession, session_id)
    breakout = db.get(ClassSession, breakout_id)
    if not parent or not breakout:
        raise HTTPException(status_code=404, detail="Class session or breakout not found")
    if breakout.parent_session_id != parent.id:
        raise HTTPException(
            status_code=422,
            detail="Breakout does not belong to this parent session",
        )
    if breakout.status != "LIVE":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot join a breakout that is {breakout.status}",
        )
    is_host_or_admin = user.id == parent.host_user_id or user.has_role("admin")
    if not is_host_or_admin and user.id not in (breakout.participant_user_ids or []):
        raise HTTPException(
            status_code=403,
            detail="You are not a member of this breakout",
        )
    if not is_host_or_admin:
        current = await count_participants(breakout.livekit_room_name)
        if current >= breakout.max_participants:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Breakout is at capacity ({current}/{breakout.max_participants})."
                ),
            )
    token, expires_at = mint_join_token(
        room=breakout.livekit_room_name,
        identity=str(user.id),
        name=user.full_name or user.username,
        can_publish=True,
        is_host=is_host_or_admin,
    )
    return ok(
        JoinTokenResponse(
            token=token,
            ws_url=settings.LIVEKIT_URL,
            room_name=breakout.livekit_room_name,
            identity=str(user.id),
            expires_at=expires_at,
            is_host=is_host_or_admin,
        )
    )


@router.post(
    "/{session_id}/breakouts/{breakout_id}/move",
    response_model=SuccessResponse[MoveBreakoutResponse],
)
async def move_breakout_participant(
    session_id: int,
    breakout_id: int,
    data: MoveBreakoutRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_HOST)),
):
    """Host moves a participant from one breakout to another.

    Updates participant_user_ids on both rooms and pushes a notification
    to the affected student via the existing notification WS pipeline.
    The student's frontend listens for type='breakout.move' and calls
    /breakouts/{target_id}/join to mint a token for the new room, then
    switchRoom. We deliberately do NOT put the JWT in the notification
    payload because notifications are persisted; the join-then-switch
    pattern keeps tokens out of the DB.
    """
    parent = db.get(ClassSession, session_id)
    source = db.get(ClassSession, breakout_id)
    target = db.get(ClassSession, data.target_breakout_id)
    if not parent or not source or not target:
        raise HTTPException(status_code=404, detail="Class session or breakout not found")
    if not _is_owner_or_admin(parent, user):
        raise HTTPException(
            status_code=403,
            detail="Only the host can move participants between breakouts",
        )
    if source.parent_session_id != parent.id or target.parent_session_id != parent.id:
        raise HTTPException(
            status_code=422,
            detail="Both breakouts must belong to this parent session",
        )
    if source.id == target.id:
        raise HTTPException(
            status_code=422, detail="Source and target breakouts are the same"
        )
    if source.status != "LIVE" or target.status != "LIVE":
        raise HTTPException(
            status_code=409, detail="Both breakouts must be LIVE to move participants"
        )
    source_ids = list(source.participant_user_ids or [])
    if data.user_id not in source_ids:
        raise HTTPException(
            status_code=422,
            detail="User is not a member of the source breakout",
        )

    # Re-check the move target is reachable by this user: must still
    # carry class_session:join (or admin:full). Guards against the host
    # smuggling an arbitrary user_id onto a breakout's participant list.
    movers = _users_with_join_permission(db, [data.user_id])
    if not movers:
        raise HTTPException(
            status_code=422,
            detail="User does not have permission to join class sessions",
        )
    moving_user = movers[0]

    target_ids = list(target.participant_user_ids or [])
    if data.user_id not in target_ids and len(target_ids) >= target.max_participants:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Target breakout is at capacity "
                f"({len(target_ids)}/{target.max_participants})."
            ),
        )

    source.participant_user_ids = [u for u in source_ids if u != data.user_id]
    if data.user_id not in target_ids:
        target.participant_user_ids = [*target_ids, data.user_id]
    db.commit()

    await notify_users_and_push(
        [data.user_id],
        type="breakout.move",
        source_module="class_session",
        source_id=str(target.id),
        title="Moved to another breakout",
        body=f"You've been moved to '{target.title}'",
        payload={
            "session_id": parent.id,
            "source_breakout_id": source.id,
            "target_breakout_id": target.id,
            "target_breakout_name": target.title,
        },
    )

    return ok(
        MoveBreakoutResponse(
            moved=True,
            source_breakout_id=source.id,
            target_breakout_id=target.id,
            user_id=moving_user.id,
        )
    )


@router.post(
    "/{session_id}/breakouts/broadcast",
    response_model=SuccessResponse[BreakoutBroadcastResponse],
)
async def broadcast_to_breakouts(
    session_id: int,
    data: BreakoutBroadcastRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_HOST)),
):
    """Send a single message to every participant across every LIVE
    breakout under this session.

    Delivery rides on the notification WS pipeline — same as
    breakout.move / breakout.return — because the host is in the parent
    LiveKit room and invitees are scattered across breakout child rooms,
    so the host's data channel can't reach them.
    """
    parent = db.get(ClassSession, session_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Class session not found")
    if not _is_owner_or_admin(parent, user):
        raise HTTPException(
            status_code=403, detail="Only the host can broadcast to breakouts"
        )
    if parent.status != "LIVE":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot broadcast to a session in {parent.status} state",
        )

    children = (
        db.query(ClassSession)
        .filter(
            ClassSession.parent_session_id == session_id,
            ClassSession.status == "LIVE",
        )
        .all()
    )

    host_name = user.full_name or user.username
    body = data.message.strip()
    delivered_users: set[int] = set()
    for child in children:
        recipient_ids = [
            uid
            for uid in (child.participant_user_ids or [])
            if uid not in delivered_users
        ]
        if not recipient_ids:
            continue
        await notify_users_and_push(
            recipient_ids,
            type="breakout.broadcast",
            source_module="class_session",
            source_id=str(child.id),
            title=f"Message from {host_name}",
            body=body,
            payload={
                "session_id": parent.id,
                "breakout_id": child.id,
                "breakout_name": child.title,
                "host_name": host_name,
                "message": body,
            },
        )
        delivered_users.update(recipient_ids)

    return ok(
        BreakoutBroadcastResponse(
            recipients=len(delivered_users), breakouts=len(children)
        )
    )


@router.post("/{session_id}/breakouts/{breakout_id}/help", status_code=202)
async def request_help_in_breakout(
    session_id: int,
    breakout_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(PermissionCode.CLASS_SESSION_JOIN)),
):
    """Student in a breakout flags that they need the host's attention.

    Pushes a notification to the parent session's host via the existing
    notification WS pipeline — the host's toast container surfaces it
    without needing the host's frontend to listen on a custom channel.
    The DB row also means the host sees it later if they were offline.
    """
    parent = db.get(ClassSession, session_id)
    breakout = db.get(ClassSession, breakout_id)
    if not parent or not breakout:
        raise HTTPException(status_code=404, detail="Class session or breakout not found")
    if breakout.parent_session_id != parent.id:
        raise HTTPException(
            status_code=422,
            detail="Breakout does not belong to this parent session",
        )
    if breakout.status != "LIVE":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot request help in a breakout that is {breakout.status}",
        )
    if user.id not in (breakout.participant_user_ids or []):
        raise HTTPException(
            status_code=403,
            detail="You are not a member of this breakout",
        )

    student_name = user.full_name or user.username
    await notify_users_and_push(
        [parent.host_user_id],
        type="breakout.help_request",
        source_module="class_session",
        source_id=str(breakout.id),
        title="Help requested",
        body=f"{student_name} in '{breakout.title}' needs help",
        payload={
            "session_id": parent.id,
            "breakout_id": breakout.id,
            "breakout_name": breakout.title,
            "student_id": user.id,
            "student_name": student_name,
        },
    )
    return ok({"sent": True})


@router.post("/livekit-webhook", include_in_schema=False)
async def livekit_webhook(request: Request):
    """LiveKit calls this when room/participant lifecycle events fire.

    Auth is via the JWT in the Authorization header, signed by the same
    LiveKit API secret we use to mint tokens — verified by
    `WebhookReceiver`. We deliberately do NOT use require_permission here;
    LiveKit is a service principal, not a JAI user.

    POC scope handles `room_finished` only — flips status to ENDED so the
    DB stays in sync when the host disconnects without clicking End. Other
    events (`participant_joined`, `participant_left`, `egress_started`,
    `egress_ended`) are accepted-and-ignored, ready to be wired up in v1
    without changing the wire shape.
    """
    raw_body = await request.body()
    body = raw_body.decode("utf-8") if isinstance(raw_body, bytes) else raw_body
    auth = request.headers.get("authorization", "")
    try:
        event = receive_webhook(body, auth)
    except Exception as exc:
        logger.warning("livekit-webhook: rejected bad signature: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event_type = getattr(event, "event", None)
    room = getattr(event, "room", None)
    room_name = getattr(room, "name", None) if room else None
    logger.info("livekit-webhook: %s room=%s", event_type, room_name)

    if event_type == "room_finished" and room_name:
        # Webhook handlers run with their own DB session — we deliberately
        # don't reuse the request-scoped one (this endpoint has no auth dep
        # so no get_db, plus the call may run after the response if LiveKit
        # batches retries).
        with SessionLocal() as db:
            session = (
                db.query(ClassSession)
                .filter(ClassSession.livekit_room_name == room_name)
                .first()
            )
            if session and session.status == "LIVE":
                session.status = "ENDED"
                session.actual_end = datetime.now(timezone.utc)
                db.commit()
                logger.info(
                    "livekit-webhook: session %d marked ENDED via room_finished",
                    session.id,
                )
    elif event_type in ("egress_started", "egress_ended", "egress_updated"):
        egress_info = getattr(event, "egress_info", None)
        if egress_info is not None:
            egress_id = getattr(egress_info, "egress_id", "")
            with SessionLocal() as db:
                rec = (
                    db.query(ClassSessionRecording)
                    .filter(ClassSessionRecording.egress_id == egress_id)
                    .first()
                )
                if rec is not None:
                    if event_type == "egress_started":
                        rec.status = "ACTIVE"
                    elif event_type == "egress_ended":
                        # LiveKit numeric statuses: 2 EGRESS_COMPLETE,
                        # 3 EGRESS_FAILED, 4 EGRESS_ABORTED, 5 EGRESS_LIMIT_REACHED.
                        eg_status = getattr(egress_info, "status", 0)
                        rec.ended_at = datetime.now(timezone.utc)
                        if eg_status == 2:
                            rec.status = "FINISHED"
                        elif eg_status in (3, 5):
                            rec.status = "FAILED"
                            rec.error_message = getattr(egress_info, "error", None)
                        elif eg_status == 4:
                            rec.status = "ABORTED"
                        # Pull file metadata if present in the payload.
                        files = list(getattr(egress_info, "file_results", []) or [])
                        if files:
                            f = files[0]
                            rec.file_path = getattr(f, "filename", rec.file_path)
                            rec.file_size_bytes = getattr(f, "size", None) or None
                            rec.duration_seconds = (
                                int(getattr(f, "duration", 0) // 1_000_000_000)
                                if getattr(f, "duration", 0)
                                else None
                            )
                    db.commit()
                    logger.info(
                        "livekit-webhook: recording %d -> %s (%s)",
                        rec.id,
                        rec.status,
                        event_type,
                    )

    return Response(status_code=204)
