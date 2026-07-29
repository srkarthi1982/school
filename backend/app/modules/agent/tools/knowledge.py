from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from app.modules.agent.context import UserContext
from app.modules.agent.tools.registry import tool

logger = logging.getLogger(__name__)

_KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "knowledge"


def _load_sections() -> list[tuple[str, str]]:
    """Split every knowledge markdown file into (heading-path, text) sections."""
    sections: list[tuple[str, str]] = []
    if not _KNOWLEDGE_DIR.is_dir():
        return sections
    for md in sorted(_KNOWLEDGE_DIR.rglob("*.md")):
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            logger.warning("Cannot read knowledge file: %s", md)
            continue
        current_title = md.stem
        buf: list[str] = []
        for line in text.splitlines():
            if line.startswith("#"):
                if buf:
                    sections.append((current_title, "\n".join(buf).strip()))
                    buf = []
                current_title = f"{md.stem} — {line.lstrip('#').strip()}"
            else:
                buf.append(line)
        if buf:
            sections.append((current_title, "\n".join(buf).strip()))
    return [(t, s) for t, s in sections if s]


@tool(
    name="search_knowledge",
    description=(
        "Search the platform's how-to knowledge base (how to use the JAI "
        "Information System: navigation, features, procedures). Use for "
        "'how do I…' questions about the system itself."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Keywords to search for"},
        },
        "required": ["query"],
    },
    status_label="Searching the knowledge base…",
)
def search_knowledge(ctx: UserContext, args: dict[str, Any]) -> Any:
    """Keyword search over knowledge/*.md.

    This is the phase-1 backend of the future ``search_documents`` RAG tool:
    when embeddings land (pgvector over uploaded materials), retrieval swaps in
    behind the same tool interface, pre-filtered by accessible_course_ids().
    """
    words = {w.lower() for w in re.findall(r"\w+", str(args.get("query", ""))) if len(w) >= 3}
    if not words:
        return {"results": []}
    scored: list[tuple[int, str, str]] = []
    for title, section in _load_sections():
        haystack = f"{title}\n{section}".lower()
        score = sum(haystack.count(w) for w in words)
        if score > 0:
            scored.append((score, title, section))
    scored.sort(key=lambda item: item[0], reverse=True)
    return {
        "results": [
            {"topic": title, "content": section[:2000]}
            for _, title, section in scored[:4]
        ]
    }
