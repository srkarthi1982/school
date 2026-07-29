"""Request-side helpers: decide what to track, attribute it, and enqueue it.

Kept separate from the middleware wiring so it can be unit-tested and reused by
the auth login handler (which records a login event directly, since the login
request carries no bearer token to attribute it from).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from starlette.requests import Request

from app.core.config import settings
from app.core.security import decode_token

from . import buffer

logger = logging.getLogger(__name__)

SILENT_HEADER = "x-silent-loading"  # mirrors frontend SILENT_HEADER (client.ts)

# Path prefixes that are never product usage: docs, health, static, the MCP
# bridge (external clients), and the analytics ingest path itself.
_SKIP_PREFIXES = (
    "/static",
    "/health",
    "/docs",
    "/redoc",
    "/openapi",
    "/favicon",
    "/api/v1/mcp",
)


def _client_ip(request: Request) -> str | None:
    """Real client IP, honouring X-Forwarded-For (leftmost) behind a proxy."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()[:64]
    if request.client:
        return request.client.host[:64]
    return None


def _user_id_from_token(request: Request) -> int | None:
    """Best-effort user id from the bearer access token. Never raises."""
    auth = request.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if payload.get("type") != "access":
        return None
    sub = payload.get("sub")
    try:
        return int(sub) if sub is not None else None
    except (TypeError, ValueError):
        return None


def _should_track(request: Request) -> bool:
    if not settings.ANALYTICS_TRACKING_ENABLED:
        return False
    if request.method == "OPTIONS":
        return False
    if request.headers.get(SILENT_HEADER):  # background poller opt-out
        return False
    path = request.url.path
    return not any(path.startswith(p) for p in _SKIP_PREFIXES)


def track_request(request: Request, status: int, duration_ms: float | None) -> None:
    """Build and enqueue a usage event for a completed request. Never raises."""
    try:
        if not _should_track(request):
            return
        user_id = _user_id_from_token(request)
        if user_id is None:  # only attribute authenticated activity
            return
        ua = request.headers.get("user-agent")
        buffer.append({
            "user_id": user_id,
            "path": request.url.path[:512],
            "method": request.method,
            "status": status,
            "duration_ms": int(duration_ms) if duration_ms is not None else None,
            "ip": _client_ip(request),
            "user_agent": ua[:512] if ua else None,
            "timestamp": datetime.now(timezone.utc),
        })
    except Exception:  # pragma: no cover - tracking must never break a request
        logger.exception("usage tracking failed")


def record_login(request: Request, user_id: int) -> None:
    """Record a successful login as a usage event (the login-count signal)."""
    try:
        if not settings.ANALYTICS_TRACKING_ENABLED:
            return
        ua = request.headers.get("user-agent")
        buffer.append({
            "user_id": user_id,
            "path": "/api/v1/auth/login",
            "method": "POST",
            "status": 200,
            "duration_ms": None,
            "ip": _client_ip(request),
            "user_agent": ua[:512] if ua else None,
            "timestamp": datetime.now(timezone.utc),
        })
    except Exception:  # pragma: no cover
        logger.exception("login tracking failed")
