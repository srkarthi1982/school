from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.modules.profile.models import ProfileModificationRequest


def build_profile_change_description(profile, data) -> str:
    """Human-readable summary of the requested personal-information changes."""
    fields = [
        ("Full Name", "full_name"),
        ("Date of Birth", "date_of_birth"),
        ("Country", "country"),
        ("Email", "email"),
        ("Mobile No", "mobile_no"),
        ("Ext No", "ext_no"),
    ]
    lines = []
    for label, attr in fields:
        old = getattr(profile, attr)
        new = getattr(data, attr)
        if old != new:
            lines.append(f"{label}: {old or '-'} -> {new or '-'}")
    return "\n".join(lines) if lines else "Profile change requested."


def apply_request_status_to_profile_mod(db: Session, request_id: UUID, to_status: str) -> bool:
    """Propagate a generic Request's outcome onto its linked profile change.

    Returns True when a linked, still-open modification request was updated so
    the caller knows it needs to commit. Approving or resolving the request
    applies the new values to the profile (the admin UI completes a request via
    "resolve"); cancelling the request cancels it. A returned request stays
    pending for resubmission.
    """
    # Lazy import: avoids a circular import via the request package at load time.
    from app.modules.request.models import RequestStatus

    mod = (
        db.query(ProfileModificationRequest)
        .filter(ProfileModificationRequest.request_id == request_id)
        .first()
    )
    if mod is None or not mod.is_open:
        return False

    if to_status in (RequestStatus.APPROVED.value, RequestStatus.RESOLVED.value):
        mod.approve_modification()
        _notify_requester(db, mod, approved=True)
    elif to_status == RequestStatus.CANCELED.value:
        # Cancellation is creator-initiated; no need to notify the requester.
        mod.cancel_modification()
    else:
        return False

    return True


def _notify_requester(db: Session, mod: ProfileModificationRequest, *, approved: bool) -> None:
    """Persist a notification telling the requester the outcome of their change.

    Runs from sync request endpoints, so it uses the sync ``notify_user`` path
    (persist only); the requester sees it via the unread count / on reconnect.
    """
    from app.modules.notification.services import notify_user

    if approved:
        title = "Profile Change Request Approved"
        body = "Your user profile change request has been approved."
    else:
        title = "Profile Change Request Rejected"
        body = "Your user profile change request has been rejected."

    notify_user(
        db,
        mod.profile.user_id,
        type="profile.mod_request_resolved",
        source_module="profile",
        title=title,
        body=body,
        source_id=str(mod.id),
        link="/communication-reporting/requests",
    )
