from __future__ import annotations

import json
import logging
import time
from collections import defaultdict, deque
from contextvars import ContextVar
from typing import Any

import mcp.types as types
from anyio import to_thread
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings

from app.core.config import settings
from app.core.database import SessionLocal
from app.modules.agent.context import UserContext, build_user_context
from app.modules.agent.models import AgentRun, AgentRunStep
from app.modules.agent.tools import execute_tool, tools_for
from app.modules.agent.tools.registry import _REGISTRY

logger = logging.getLogger(__name__)

# Set by the ASGI auth wrapper before the request is handed to the MCP
# session manager; the handler tasks inherit it via context copy.
_current_user_id: ContextVar[int | None] = ContextVar("mcp_current_user_id", default=None)

# Per-user sliding-window rate limit for tool calls. In-process on purpose:
# the app runs single-process, and the existing slowapi limiter cannot see
# inside an ASGI mount.
_call_times: dict[int, deque[float]] = defaultdict(deque)


def _rate_limited(user_id: int) -> bool:
    window = 60.0
    now = time.monotonic()
    times = _call_times[user_id]
    while times and now - times[0] > window:
        times.popleft()
    if len(times) >= settings.MCP_RATE_LIMIT_PER_MINUTE:
        return True
    times.append(now)
    return False


def _build_ctx(db, user_id: int) -> UserContext:
    from app.modules.users.models import User

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise PermissionError("User not found or inactive")
    return build_user_context(db, user)


def _list_tools_sync(user_id: int) -> list[types.Tool]:
    db = SessionLocal()
    try:
        ctx = _build_ctx(db, user_id)
        return [
            types.Tool(name=spec.name, description=spec.description, inputSchema=spec.parameters)
            for spec in tools_for(ctx)
        ]
    finally:
        db.close()


def _call_tool_sync(user_id: int, name: str, arguments: dict[str, Any]) -> str:
    """Run one tool as the token's user and audit it as an agent run."""
    db = SessionLocal()
    started = time.monotonic()
    try:
        ctx = _build_ctx(db, user_id)
        spec = _REGISTRY.get(name)
        # Same gate as tools_for: unknown, mutating, or not-permitted tools
        # are all invisible to MCP clients.
        if spec is None or spec.mutating or (
            spec.permission is not None and not ctx.has_permission(spec.permission.value)
        ):
            result = json.dumps({"error": f"Unknown tool: {name}"})
            status = "denied"
        else:
            result = execute_tool(spec, ctx, arguments)
            status = "succeeded"

        latency_ms = int((time.monotonic() - started) * 1000)
        run = AgentRun(agent_id=None, channel="mcp", user_id=user_id, status=status, latency_ms=latency_ms)
        db.add(run)
        db.flush()
        db.add(AgentRunStep(
            run_id=run.id, seq=1, step_type="tool_call", tool_name=name,
            arguments=arguments, result_summary=result[:500], duration_ms=latency_ms,
        ))
        db.commit()
        return result
    finally:
        db.close()


server = Server("jai-lms")


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    user_id = _current_user_id.get()
    if user_id is None:
        return []
    return await to_thread.run_sync(_list_tools_sync, user_id)


@server.call_tool()
async def handle_call_tool(name: str, arguments: dict[str, Any] | None) -> list[types.ContentBlock]:
    user_id = _current_user_id.get()
    if user_id is None:
        return [types.TextContent(type="text", text=json.dumps({"error": "Not authenticated"}))]
    if _rate_limited(user_id):
        return [types.TextContent(type="text", text=json.dumps({"error": "Rate limit exceeded. Try again in a minute."}))]
    try:
        result = await to_thread.run_sync(_call_tool_sync, user_id, name, arguments or {})
    except Exception:
        logger.exception("MCP tool call failed (user=%s tool=%s)", user_id, name)
        result = json.dumps({"error": "The tool failed unexpectedly."})
    return [types.TextContent(type="text", text=result)]


session_manager = StreamableHTTPSessionManager(
    app=server,
    json_response=True,
    stateless=True,
    # PAT auth is the gate; this is an internal service reached under several
    # hostnames, so host/origin allowlisting is disabled rather than guessed.
    security_settings=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


def _bearer_token(scope) -> str | None:
    for key, value in scope.get("headers", []):
        if key == b"authorization":
            header = value.decode("latin-1")
            if header.lower().startswith("bearer "):
                return header[7:].strip() or None
    return None


async def _send_401(send) -> None:
    body = json.dumps({"error": "Missing or invalid personal access token"}).encode()
    await send({
        "type": "http.response.start",
        "status": 401,
        "headers": [
            (b"content-type", b"application/json"),
            (b"www-authenticate", b"Bearer"),
            (b"content-length", str(len(body)).encode()),
        ],
    })
    await send({"type": "http.response.body", "body": body})


async def mcp_asgi_app(scope, receive, send) -> None:
    """ASGI entry mounted at /api/v1/mcp: PAT auth, then MCP protocol."""
    if scope["type"] == "lifespan":
        # The mount receives no lifespan events under FastAPI, but be safe.
        return
    if scope["type"] != "http":
        return

    token = _bearer_token(scope)
    if not token:
        await _send_401(send)
        return

    def _resolve() -> int | None:
        from app.modules.pat.services import resolve_pat_user

        db = SessionLocal()
        try:
            user = resolve_pat_user(db, token)
            return user.id if user is not None else None
        finally:
            db.close()

    user_id = await to_thread.run_sync(_resolve)
    if user_id is None:
        await _send_401(send)
        return

    _current_user_id.set(user_id)
    await session_manager.handle_request(scope, receive, send)
