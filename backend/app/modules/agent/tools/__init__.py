# Importing the tool modules registers their tools with the registry.
from app.modules.agent.tools import announcements, courses, grades, knowledge, materials, memory, people, schedule, ui_guides  # noqa: F401
from app.modules.agent.tools.registry import (
    ToolError,
    ToolSpec,
    all_tools,
    execute_tool,
    openai_tool_schema,
    tool,
    tools_for,
)

__all__ = [
    "ToolError",
    "ToolSpec",
    "all_tools",
    "execute_tool",
    "openai_tool_schema",
    "tool",
    "tools_for",
]
