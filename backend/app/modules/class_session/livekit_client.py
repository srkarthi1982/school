"""LiveKit client wrapper.

Token signing is sync (pure crypto). Admin API calls (room create/delete,
participant listing) are async because the underlying livekit-api SDK uses
aiohttp; the FastAPI endpoints that call them are correspondingly `async
def`. Webhook verification is sync — TokenVerifier is.

We instantiate a fresh `LiveKitAPI` per call rather than holding a process
singleton because (a) the connection cost to a localhost SFU is negligible,
(b) the SDK's aiohttp session is awkward to share across request scopes,
(c) failures during shutdown (no graceful close) leak less.
"""
import logging
from datetime import datetime, timedelta, timezone

from livekit import api as lkapi

from app.core.config import settings

logger = logging.getLogger(__name__)

_token_verifier = lkapi.TokenVerifier(
    settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET
)
_webhook_receiver = lkapi.WebhookReceiver(_token_verifier)


def _client() -> lkapi.LiveKitAPI:
    return lkapi.LiveKitAPI(
        settings.LIVEKIT_API_URL,
        settings.LIVEKIT_API_KEY,
        settings.LIVEKIT_API_SECRET,
    )


def mint_join_token(
    *,
    room: str,
    identity: str,
    name: str,
    can_publish: bool,
    is_host: bool,
    ttl_minutes: int = 240,
) -> tuple[str, datetime]:
    """Sign a LiveKit access token granting room_join + tracks.

    Returns (jwt, expires_at_utc).

    Default TTL is 4 hours, comfortably longer than a typical class so the
    token doesn't expire mid-session and force a reconnect storm. The full
    v1 plan adds a frontend reconnect-on-TOKEN_EXPIRED handler; this
    longer TTL is the cheap mitigation in the meantime.
    """
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    # E1 — only hosts can publish screen-share / screen-share-audio tracks.
    # Students get the camera + microphone subset so they can talk and turn
    # their camera on, but can't hijack the class with their screen.
    # `can_publish_sources=None` means "all sources allowed" (host).
    publish_sources = (
        None if is_host else ["camera", "microphone"]
    )
    grants = lkapi.VideoGrants(
        room=room,
        room_join=True,
        can_publish=can_publish,
        can_subscribe=True,
        can_publish_data=True,
        can_publish_sources=publish_sources,
    )
    jwt = (
        lkapi.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(name)
        .with_grants(grants)
        .with_ttl(timedelta(minutes=ttl_minutes))
        .to_jwt()
    )
    return jwt, expires_at


def receive_webhook(body: bytes | str, auth_header: str):
    """Verify the incoming LiveKit webhook signature and decode the event.

    Raises ValueError / similar if the signature is invalid — the caller
    should translate that into a 401.
    """
    return _webhook_receiver.receive(body, auth_header)


async def ensure_room(*, name: str, max_participants: int) -> None:
    """Create the LiveKit room if it doesn't exist yet, with a hard cap on
    concurrent participants and short post-empty cleanup timeouts.

    Idempotent — if the room is already there from a partially-recovered
    earlier /start, the create call will fail and we swallow the error.
    Pre-creating the room is what gives us hard max-participants
    enforcement: the SFU will reject the 11th joiner if max is 10, even
    if we miss the soft check on /join.
    """
    async with _client() as client:
        try:
            await client.room.create_room(
                lkapi.CreateRoomRequest(
                    name=name,
                    max_participants=max_participants,
                    empty_timeout=300,
                    departure_timeout=20,
                )
            )
        except Exception as exc:
            logger.info("ensure_room: ignored (%s) name=%s", exc, name)


async def delete_room(name: str) -> None:
    """Terminate the LiveKit room and disconnect any remaining participants.

    Errors are logged but not raised — the room may already be gone (last
    participant left, server cleaned up) and that is the desired post-state.
    """
    async with _client() as client:
        try:
            await client.room.delete_room(lkapi.DeleteRoomRequest(room=name))
        except Exception as exc:
            logger.info("delete_room: ignored (%s) name=%s", exc, name)


async def count_participants(name: str) -> int:
    """Return the current participant count for `name`, or 0 if the room
    does not exist or the call fails."""
    async with _client() as client:
        try:
            resp = await client.room.list_participants(
                lkapi.ListParticipantsRequest(room=name)
            )
            return len(resp.participants)
        except Exception as exc:
            logger.info("count_participants: %s name=%s", exc, name)
            return 0


async def start_room_composite_recording(
    *, room_name: str, output_dir: str
) -> tuple[str, str]:
    """Kick off a Room-Composite Egress recording for `room_name`.

    Returns (egress_id, file_path_template). The template is the path the
    LiveKit Egress container will write the MP4 to once recording starts;
    LiveKit substitutes `{room_name}` and `{time}` at start time and
    surfaces the resolved path in the egress_ended webhook payload.
    Requires a configured Egress + Redis topology — without those, this
    raises and the /recordings/start endpoint returns the error verbatim.
    """
    file_template = (
        f"{output_dir.rstrip('/')}/cs-{room_name}-{{time}}.mp4"
    )
    async with _client() as client:
        req = lkapi.RoomCompositeEgressRequest(
            room_name=room_name,
            file_outputs=[
                lkapi.EncodedFileOutput(
                    filepath=file_template,
                    file_type=lkapi.EncodedFileType.MP4,
                    disable_manifest=True,
                )
            ],
        )
        info = await client.egress.start_room_composite_egress(req)
        return info.egress_id, file_template


async def stop_recording(egress_id: str) -> None:
    """Tell LiveKit Egress to finalise the given recording. The
    egress_ended webhook fires when the encoder finishes flushing."""
    async with _client() as client:
        try:
            await client.egress.stop_egress(
                lkapi.StopEgressRequest(egress_id=egress_id)
            )
        except Exception as exc:
            logger.info("stop_egress: ignored (%s) egress_id=%s", exc, egress_id)
