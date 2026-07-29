"""Spike: validate that the configured LLM endpoint reliably emits native
tool calls before relying on it for the AskMAI agent.

Usage (from backend/):
    .venv/Scripts/python -m scripts.validate_llm_tool_calling

Reads LLM_BASE_URL / LLM_API_KEY / LLM_MODEL from .env like the app does.
Sends prompts that must trigger a tool call and prompts that must NOT,
using the real registry's tool schemas, and reports pass/fail per case.
"""
from __future__ import annotations

import asyncio
import sys

from app.modules.agent.llm import OpenAICompatibleProvider
from app.modules.agent.tools import all_tools, openai_tool_schema

SYSTEM = (
    "You are AskMAI, an assistant inside a school information system. "
    "Use the available tools to answer questions about the user's data. "
    "Only answer school-related questions."
)

# (prompt, expected tool name or None if no tool call expected)
CASES: list[tuple[str, str | None]] = [
    ("What courses am I enrolled in?", "list_my_courses"),
    ("Show my schedule for next week", "get_my_schedule"),
    ("What lessons are in course 12?", "get_course_lessons"),
    ("How do I submit a dynamic form?", "search_knowledge"),
    ("Who teaches course 7?", "list_course_people"),
    ("Hello!", None),
]


async def main() -> int:
    provider = OpenAICompatibleProvider()
    tools = [openai_tool_schema(spec) for spec in all_tools()]
    print(f"Model: {provider.model} @ {provider.base_url}")
    print(f"Offering {len(tools)} tools\n")

    failures = 0
    for prompt, expected in CASES:
        messages = [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ]
        try:
            response = await provider.complete(messages, tools=tools)
        except Exception as exc:
            print(f"FAIL  {prompt!r}: request error: {exc}")
            failures += 1
            continue

        called = [tc.name for tc in response.tool_calls]
        if expected is None:
            ok = not called
        else:
            ok = expected in called
        status = "ok  " if ok else "FAIL"
        if not ok:
            failures += 1
        print(f"{status}  {prompt!r} -> tool_calls={called or 'none'} (expected {expected or 'none'})")
        if called and response.tool_calls[0].arguments:
            print(f"      args: {response.tool_calls[0].arguments}")

    await provider.close()
    print(f"\n{len(CASES) - failures}/{len(CASES)} cases passed")
    if failures:
        print("Tool calling is NOT reliable enough on this model/endpoint yet.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
