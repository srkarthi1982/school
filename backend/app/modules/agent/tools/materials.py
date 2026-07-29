from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.core.permissions import PermissionCode
from app.modules.agent.context import UserContext
from app.modules.agent.tools.courses import accessible_course_ids
from app.modules.agent.tools.registry import ToolError, tool
from app.modules.course.models import CourseInstance


_TOP_K_MAX = 50


def _citation(source_type: str, course_title: str | None, document_title: str, page_no) -> str:
    if source_type == "library":
        prefix = f"Library — {document_title}"
    elif course_title:
        prefix = f"{course_title} — {document_title}"
    else:
        prefix = document_title
    return f"{prefix}, p. {page_no}" if page_no is not None else prefix


@tool(
    name="search_materials",
    description=(
        "Hybrid search (semantic + exact keyword, so precise terms and codes "
        "also match) over the content of two sources: materials of the courses "
        "the user is registered in, and the institution's library documents. "
        "Use this to answer questions about what a lesson, handout, or document "
        "actually says. Returns the most relevant text passages, each with a "
        "ready-made `citation` (course/library, document title, page) — quote "
        "that citation when answering. Only searches documents the user is "
        "allowed to see."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural-language search query (Arabic or English).",
            },
            "top_k": {
                "type": "integer",
                "description": "How many passages to return (default 8, max 50).",
            },
        },
        "required": ["query"],
    },
    # Gated in-handler by material:read OR library:read (any-of), matching the
    # /rag/search endpoint — the registry's single-permission gate can't express
    # any-of, so permission is None here and enforced below.
    permission=None,
    status_label="Searching materials…",
)
def search_materials(ctx: UserContext, args: dict[str, Any]) -> Any:
    from app.modules.rag import services as rag_services

    if not ctx.has_permission(
        PermissionCode.MATERIAL_READ.value, PermissionCode.LIBRARY_READ.value
    ):
        raise ToolError("You do not have access to course materials or the library.")

    query = (args.get("query") or "").strip()
    if not query:
        raise ToolError("Provide a search query.")
    top_k_arg = args.get("top_k")
    top_k: int | None = None
    if top_k_arg is not None:
        try:
            top_k = int(top_k_arg)
        except (TypeError, ValueError):
            raise ToolError("top_k must be an integer.")
        top_k = max(1, min(top_k, _TOP_K_MAX))

    allowed = accessible_course_ids(ctx)
    is_library_manager = ctx.has_permission(PermissionCode.LIBRARY_MANAGE.value)

    # A document-scoped conversation pins retrieval to that one document. The
    # scope comes from the conversation (via UserContext), never from the model.
    document = None
    if ctx.doc_source_type and ctx.doc_id:
        document = (ctx.doc_source_type, ctx.doc_id)

    results = rag_services.search(
        ctx.db,
        query,
        accessible_course_ids=allowed,
        is_library_manager=is_library_manager,
        full_name=ctx.full_name,
        top_k=top_k,
        document=document,
    )

    # Resolve course-instance ids to course titles so citations can name the
    # course (document_title alone is just the uploaded filename).
    instance_ids = {r.course_instance_id for r in results if r.course_instance_id is not None}
    course_titles: dict[int, str] = {}
    if instance_ids:
        rows = ctx.db.execute(
            select(CourseInstance.id, CourseInstance.title).where(
                CourseInstance.id.in_(instance_ids)
            )
        )
        course_titles = {row[0]: row[1] for row in rows}

    items = []
    for r in results:
        course_title = course_titles.get(r.course_instance_id) if r.course_instance_id else None
        items.append(
            {
                "source": r.source_type,
                "course": course_title,
                "document_title": r.document_title,
                "page": r.page_no,
                "content": r.content,
                "score": round(r.score, 3),
                "citation": _citation(r.source_type, course_title, r.document_title, r.page_no),
            }
        )

    # Doc-chat with an empty result: distinguish "not indexed (yet)" from a
    # genuinely unanswered query, so the agent tells the user the real reason
    # (e.g. a freshly uploaded course file waits for the course approval).
    if document is not None and not items:
        indexed, reason = rag_services.document_index_status(ctx.db, *document)
        if not indexed:
            return {"results": [], "document_status": reason}
    return {"results": items}
