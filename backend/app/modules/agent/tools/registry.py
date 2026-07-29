from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable

from app.core.config import settings
from app.core.permissions import PermissionCode
from app.modules.agent.context import UserContext

logger = logging.getLogger(__name__)

ToolHandler = Callable[[UserContext, dict[str, Any]], Any]


@dataclass(frozen=True)
class ToolSpec:
    """One agent capability.

    The shape mirrors MCP tool definitions (name / description / JSON-schema
    input) so the same registry can later back an MCP server endpoint.
    """

    name: str
    description: str
    parameters: dict[str, Any]
    handler: ToolHandler
    permission: PermissionCode | None = None
    mutating: bool = False
    status_label: str | None = None  # shown to the user while the tool runs


_REGISTRY: dict[str, ToolSpec] = {}


def tool(
    name: str,
    description: str,
    parameters: dict[str, Any] | None = None,
    permission: PermissionCode | None = None,
    mutating: bool = False,
    status_label: str | None = None,
) -> Callable[[ToolHandler], ToolHandler]:
    """Register a function as an agent tool.

    ``permission`` gates whether the tool is offered to the model at all for a
    given user; the handler must additionally scope its queries to the
    UserContext (permission says "may use the feature", scoping says "only
    their slice of it").
    """

    def decorator(fn: ToolHandler) -> ToolHandler:
        if name in _REGISTRY:
            raise ValueError(f"Duplicate tool name: {name}")
        _REGISTRY[name] = ToolSpec(
            name=name,
            description=description,
            parameters=parameters or {"type": "object", "properties": {}},
            handler=fn,
            permission=permission,
            mutating=mutating,
            status_label=status_label,
        )
        return fn

    return decorator


def all_tools() -> list[ToolSpec]:
    return list(_REGISTRY.values())


def tools_for(ctx: UserContext, include_mutating: bool = False) -> list[ToolSpec]:
    """Tools this user is allowed to use. Phase 1 excludes mutating tools."""
    allowed: list[ToolSpec] = []
    for spec in _REGISTRY.values():
        if spec.mutating and not include_mutating:
            continue
        if spec.permission is not None and not ctx.has_permission(spec.permission.value):
            continue
        allowed.append(spec)
    return allowed



def openai_tool_schema(spec: ToolSpec) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": spec.name,
            "description": spec.description,
            "parameters": spec.parameters,
        },
    }


def execute_tool(spec: ToolSpec, ctx: UserContext, arguments: dict[str, Any]) -> str:
    """Run a tool and return its result as a string for the LLM.

    Results are data for the model to summarize, never instructions; the
    system prompt tells the model to treat them that way. Output is truncated
    so a huge result cannot blow up the context window.
    """
    try:
        result = spec.handler(ctx, arguments)
    except ToolError as exc:
        return json.dumps({"error": str(exc)})
    except Exception:
        logger.exception("Tool %s failed (user=%s)", spec.name, ctx.user_id)
        return json.dumps({"error": "The tool failed unexpectedly."})

    if not isinstance(result, str):
        result = json.dumps(result, default=str, ensure_ascii=False)

    max_chars = settings.AGENT_TOOL_RESULT_MAX_CHARS
    if len(result) > max_chars:
        result = result[:max_chars] + f'... [truncated, {len(result)} chars total]'
    return result


class ToolError(Exception):
    """Raise from a tool handler to return a clean, user-explainable error."""
