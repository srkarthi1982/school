from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LLMToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    content: str | None
    tool_calls: list[LLMToolCall] = field(default_factory=list)
    input_tokens: int | None = None
    output_tokens: int | None = None


class LLMProvider(abc.ABC):
    """Abstraction over the chat-completion backend (OpenAI-compatible)."""

    @abc.abstractmethod
    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        """One chat-completion turn. ``messages`` uses the OpenAI format."""

    async def close(self) -> None:  # pragma: no cover - default no-op
        return None
