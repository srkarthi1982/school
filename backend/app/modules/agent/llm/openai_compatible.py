from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from openai import AsyncOpenAI

from app.core.config import settings
from app.modules.agent.llm.base import LLMProvider, LLMResponse, LLMToolCall

logger = logging.getLogger(__name__)


class OpenAICompatibleProvider(LLMProvider):
    """OpenAI-compatible chat-completions provider (OpenAI, vLLM, Ollama, …)
    with native function/tool calling."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self.base_url = base_url or settings.LLM_BASE_URL
        self.api_key = api_key or settings.LLM_API_KEY or "not-needed"
        self.model = model or settings.LLM_MODEL
        self._client: AsyncOpenAI | None = None

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            http_client = httpx.AsyncClient(verify=settings.LLM_VERIFY_SSL, timeout=settings.LLM_TIMEOUT_SECONDS)
            self._client = AsyncOpenAI(base_url=self.base_url, api_key=self.api_key, http_client=http_client)
        return self._client

    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        client = self._get_client()
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": settings.LLM_MAX_TOKENS,
            "temperature": settings.LLM_TEMPERATURE,
        }
        if tools:
            kwargs["tools"] = tools
        response = await client.chat.completions.create(**kwargs)
        choice = response.choices[0].message

        tool_calls: list[LLMToolCall] = []
        for tc in choice.tool_calls or []:
            try:
                arguments = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                logger.warning("Model produced non-JSON tool arguments for %s", tc.function.name)
                arguments = {}
            tool_calls.append(LLMToolCall(id=tc.id, name=tc.function.name, arguments=arguments))

        usage = getattr(response, "usage", None)
        return LLMResponse(
            content=choice.content,
            tool_calls=tool_calls,
            input_tokens=getattr(usage, "prompt_tokens", None),
            output_tokens=getattr(usage, "completion_tokens", None),
        )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None
