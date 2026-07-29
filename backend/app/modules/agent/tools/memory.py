from __future__ import annotations

from typing import Any

from sqlalchemy import delete, func, select

from app.core.config import settings
from app.modules.agent.context import UserContext
from app.modules.agent.models import AgentUserMemory
from app.modules.agent.tools.registry import ToolError, tool


@tool(
    name="save_memory",
    description=(
        "Save one durable fact or preference about the current user to your "
        "long-term memory, so you remember it in future conversations. Always "
        "use it when the user explicitly asks you to remember something; you "
        "may also use it for clearly durable preferences (e.g. preferred "
        "language or answer style). Each memory must be a single short "
        "sentence about the user themself. Never store passwords or other "
        "credentials, medical or fitness details, disciplinary matters, or "
        "personal data about other people. If a memory listed in 'Things you "
        "remember about this user' already covers the same fact, pass its id "
        "as replaces_id to update it instead of saving a near-duplicate. "
        "Briefly tell the user what you saved."
    ),
    parameters={
        "type": "object",
        "properties": {
            "content": {
                "type": "string",
                "description": "The fact to remember, as one short sentence.",
            },
            "replaces_id": {
                "type": "integer",
                "description": "id of an existing memory this replaces (the number in [m<id>]).",
            },
        },
        "required": ["content"],
    },
    status_label="Updating memory…",
)
def save_memory(ctx: UserContext, args: dict[str, Any]) -> Any:
    content = str(args.get("content", "")).strip()
    if not content:
        raise ToolError("Memory content must not be empty.")
    if len(content) > settings.AGENT_MEMORY_MAX_CHARS:
        raise ToolError(
            f"Memory is too long ({len(content)} chars, max {settings.AGENT_MEMORY_MAX_CHARS}). "
            "Rephrase it as one short sentence."
        )

    replaces_id = args.get("replaces_id")
    if replaces_id is not None:
        memory = ctx.db.execute(
            select(AgentUserMemory).where(
                AgentUserMemory.id == int(replaces_id),
                AgentUserMemory.user_id == ctx.user_id,
            )
        ).scalar_one_or_none()
        if memory is None:
            raise ToolError(f"No memory with id {replaces_id} exists for this user.")
        memory.content = content
        ctx.db.commit()
        return {"status": "updated", "memory_id": memory.id, "content": content}

    count = ctx.db.execute(
        select(func.count()).select_from(AgentUserMemory).where(AgentUserMemory.user_id == ctx.user_id)
    ).scalar_one()
    if count >= settings.AGENT_MEMORY_MAX_PER_USER:
        raise ToolError(
            f"Memory is full ({settings.AGENT_MEMORY_MAX_PER_USER} items). Replace an existing "
            "memory using replaces_id, or ask the user which memory to forget."
        )

    memory = AgentUserMemory(user_id=ctx.user_id, content=content)
    ctx.db.add(memory)
    ctx.db.commit()
    return {"status": "saved", "memory_id": memory.id, "content": content}


@tool(
    name="forget_memory",
    description=(
        "Delete something from your long-term memory about the current user. "
        "Use when the user asks you to forget a specific memory (pass the id "
        "from [m<id>] in 'Things you remember about this user') or everything "
        "you remember about them (pass forget_all=true). Confirm to the user "
        "what was forgotten."
    ),
    parameters={
        "type": "object",
        "properties": {
            "memory_id": {
                "type": "integer",
                "description": "id of the single memory to forget (the number in [m<id>]).",
            },
            "forget_all": {
                "type": "boolean",
                "description": "Forget every stored memory about this user.",
            },
        },
    },
    status_label="Forgetting…",
)
def forget_memory(ctx: UserContext, args: dict[str, Any]) -> Any:
    if args.get("forget_all"):
        result = ctx.db.execute(delete(AgentUserMemory).where(AgentUserMemory.user_id == ctx.user_id))
        ctx.db.commit()
        return {"status": "forgot_all", "deleted": result.rowcount}

    memory_id = args.get("memory_id")
    if memory_id is None:
        raise ToolError("Pass memory_id to forget one memory, or forget_all=true to forget everything.")
    result = ctx.db.execute(
        delete(AgentUserMemory).where(
            AgentUserMemory.id == int(memory_id),
            AgentUserMemory.user_id == ctx.user_id,
        )
    )
    ctx.db.commit()
    if result.rowcount == 0:
        raise ToolError(f"No memory with id {memory_id} exists for this user.")
    return {"status": "forgotten", "memory_id": int(memory_id)}
