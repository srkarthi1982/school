"""RAG ingestion and retrieval.

Ingestion: resolve a source file's bytes → docling-serve convert → in-process
HybridChunk → embed (bge-m3) → replace the file's chunks in pgvector, tracked by
a per-file watermark (RagIngestionState).

Retrieval: embed the query → pgvector cosine search with a WHERE that joins to
the live source tables so access control is always fresh (course chunks scoped by
accessible course-instance ids; library chunks scoped by the library _can_view
rule).
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.rag.chunker import Chunk, chunk_docling_json
from app.modules.rag.docling_client import DoclingClient
from app.modules.rag.embedding_client import make_embedding_client
from app.modules.rag.models import (
    SOURCE_COURSE_MATERIAL,
    SOURCE_LIBRARY,
    DocumentChunk,
    RagIngestionState,
)
from app.modules.rag.text_normalize import normalize_for_embedding

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Source resolution
# ---------------------------------------------------------------------------
def _resolve_library_path(row) -> Path:
    """Locate a LibraryMaterial's bytes on disk.

    ``file_url`` is a storage key relative to ONE of two roots, and the row does not
    record which: a direct library upload lands under FILE_SHARING_UPLOAD_DIR, while a
    row mirrored from a course material file (create_library_material_for_cs_file)
    reuses that file's key, which is relative to MATERIAL_UPLOAD_DIR. ``material_type``
    does NOT tell the two apart — most rows typed 'course' are direct uploads — so the
    file is located, never guessed. Probing is safe: storage keys are UUID-named, so
    the roots cannot collide (verified: zero overlapping keys on disk).

    app.modules.library resolves this its own way, keyed off material_type. RAG
    deliberately does not depend on that: it is being worked on, and its guess is wrong
    for the majority of rows. Collapse the two once that module settles.
    """
    if not row.file_url:
        raise FileNotFoundError(f"library material {row.id} has no file_url")
    for base in (settings.FILE_SHARING_UPLOAD_DIR, settings.MATERIAL_UPLOAD_DIR):
        path = base / row.file_url
        if path.exists():
            return path
    raise FileNotFoundError(
        f"library material {row.id}: {row.file_url} is under neither storage root"
    )


@dataclass
class _SourceFile:
    file_bytes: bytes
    filename: str
    content_type: str
    title: str
    course_material_file_id: str | None = None
    course_instance_id: int | None = None
    library_material_id: int | None = None


def _load_source(db: Session, source_type: str, source_id: str) -> _SourceFile | None:
    if source_type == SOURCE_COURSE_MATERIAL:
        import uuid as _uuid

        from app.modules.course_selection_material.models import CourseSelectionMaterialFile
        from app.modules.file_sharing.storage import FilesystemStorage

        row = db.get(CourseSelectionMaterialFile, _uuid.UUID(source_id))
        if row is None:
            return None
        storage = FilesystemStorage(settings.MATERIAL_UPLOAD_DIR)
        file_bytes = storage.read(row.storage_key)
        return _SourceFile(
            file_bytes=file_bytes,
            filename=row.filename,
            content_type=row.content_type or "",
            title=row.filename,
            course_material_file_id=str(row.id),
            course_instance_id=row.course_instance_id,
        )

    if source_type == SOURCE_LIBRARY:
        from app.modules.library.models import LibraryMaterial

        row = db.get(LibraryMaterial, int(source_id))
        if row is None:
            return None
        # Raises FileNotFoundError when the bytes are really gone. That is an error,
        # not a missing source row, so it must not be swallowed into None here — see
        # ingest_source_file, which tells the two apart.
        abs_path = _resolve_library_path(row)
        file_bytes = abs_path.read_bytes()
        return _SourceFile(
            file_bytes=file_bytes,
            filename=row.file_name or row.title,
            content_type=row.content_type or "",
            title=row.title or row.file_name or "",
            library_material_id=row.id,
        )

    raise ValueError(f"Unknown source_type: {source_type}")


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------
def _get_or_create_state(db: Session, source_type: str, source_id: str) -> RagIngestionState:
    state = (
        db.query(RagIngestionState)
        .filter(
            RagIngestionState.source_type == source_type,
            RagIngestionState.source_id == source_id,
        )
        .one_or_none()
    )
    if state is None:
        state = RagIngestionState(source_type=source_type, source_id=source_id, status="pending")
        db.add(state)
        db.flush()
    return state


def _get_state(db: Session, source_type: str, source_id: str) -> RagIngestionState | None:
    return (
        db.query(RagIngestionState)
        .filter(
            RagIngestionState.source_type == source_type,
            RagIngestionState.source_id == source_id,
        )
        .one_or_none()
    )


# ---------------------------------------------------------------------------
# Library ingestion candidates
# ---------------------------------------------------------------------------
def eligible_library_materials(db: Session) -> list:
    """Library documents that RAG should index: approved, non-personal, with a file
    of an indexable type."""
    from app.modules.library.models import LibraryMaterial

    allowed = list(settings.RAG_ALLOWED_CONTENT_TYPES)
    return (
        db.query(LibraryMaterial)
        .filter(
            LibraryMaterial.approved_status == "approved",
            LibraryMaterial.material_type != "personal",
            LibraryMaterial.file_url.isnot(None),
            LibraryMaterial.content_type.in_(allowed),
        )
        .all()
    )


# EVERY eligible material gets its own binding — there is no version supersession.
# Grouping rows by (title, category, material_type) and indexing only the newest was
# too lossy to keep: course-material mirrors take the *filename* as their title, so
# two unrelated files sharing a name hid each other, and the non-newest members were
# never queued at all — leaving them permanently "queued for indexing".
#
# Indexing a duplicate is cheap anyway: ingest_source_file links the binding to
# already-indexed content by content_hash, without converting or embedding again.


def gc_orphans(db: Session) -> tuple[int, int]:
    """Maintenance sweep: (1) drop bindings whose source file no longer exists,
    then (2) delete content chunks that no *done* binding references anymore.

    Content is decoupled from the source tables (no FK cascade), so this is how
    storage left by a deleted material — or by a source re-pointed to different
    bytes — is reclaimed. A chunk survives as long as any live source still binds
    its hash. Returns ``(bindings_removed, chunks_removed)``."""
    import uuid as _uuid

    from app.modules.course_selection_material.models import CourseSelectionMaterialFile
    from app.modules.library.models import LibraryMaterial

    bindings_removed = 0
    for st in db.query(RagIngestionState).all():
        exists = True
        if st.source_type == SOURCE_COURSE_MATERIAL:
            try:
                exists = db.get(CourseSelectionMaterialFile, _uuid.UUID(st.source_id)) is not None
            except (TypeError, ValueError):
                exists = False
        elif st.source_type == SOURCE_LIBRARY:
            try:
                exists = db.get(LibraryMaterial, int(st.source_id)) is not None
            except (TypeError, ValueError):
                exists = False
        if not exists:
            db.delete(st)
            bindings_removed += 1
    if bindings_removed:
        db.commit()

    result = db.execute(
        text(
            "DELETE FROM document_chunks c "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM rag_ingestion_state s "
            "  WHERE s.content_hash = c.content_hash AND s.status = 'done'"
            ")"
        )
    )
    chunks_removed = result.rowcount or 0
    db.commit()
    return bindings_removed, chunks_removed


def _chunks_from_endpoint(raw: list[dict]) -> list[Chunk]:
    out: list[Chunk] = []
    for i, d in enumerate(raw):
        txt = d.get("text") or d.get("chunk") or ""
        if not txt.strip():
            continue
        page = d.get("page_no") or d.get("page")
        headings = d.get("headings") or d.get("title") or []
        if isinstance(headings, str):
            headings = [headings]
        out.append(
            Chunk(
                text=txt,
                embed_text=txt,
                page_no=int(page) if page is not None else None,
                headings=list(headings),
                chunk_index=i,
            )
        )
    return out


def _chunks_exist(db: Session, content_hash: str | None) -> bool:
    if not content_hash:
        return False
    return (
        db.query(DocumentChunk.id)
        .filter(DocumentChunk.content_hash == content_hash)
        .first()
        is not None
    )


def _content_referenced(
    db: Session, content_hash: str | None, *, exclude: tuple[str, str] | None = None
) -> bool:
    """True if any *done* binding still points at this content_hash (optionally
    ignoring one ``(source_type, source_id)`` binding)."""
    if not content_hash:
        return False
    q = db.query(RagIngestionState.id).filter(
        RagIngestionState.content_hash == content_hash,
        RagIngestionState.status == "done",
    )
    if exclude is not None:
        st, sid = exclude
        q = q.filter(
            ~(
                (RagIngestionState.source_type == st)
                & (RagIngestionState.source_id == sid)
            )
        )
    return q.first() is not None


def _gc_content_if_orphan(db: Session, content_hash: str | None) -> None:
    """Delete the chunks for ``content_hash`` iff no *done* binding references it
    anymore. This is how shared content is reaped once its last source is gone or
    re-pointed (there is no FK cascade — content is decoupled from sources)."""
    if not content_hash:
        return
    if not _content_referenced(db, content_hash):
        db.query(DocumentChunk).filter(
            DocumentChunk.content_hash == content_hash
        ).delete(synchronize_session=False)
        db.commit()


def ingest_source_file(db: Session, source_type: str, source_id: str) -> int:
    """(Re)index a single source file. Returns the number of chunks written (0 when
    the source is linked to already-indexed identical content).

    Deduplicated by content hash across ALL sources: if the exact bytes are already
    indexed by any source, this source is *linked* to that content — no Docling
    conversion, no embedding — and only its binding row is refreshed. Idempotent:
    skips entirely when the binding is already ``done`` for the same hash and the
    content still exists. Runs sync (called from scheduler worker threads).
    """
    import uuid as _uuid

    logger.info("RAG ingest: loading source %s/%s", source_type, source_id)
    state = _get_or_create_state(db, source_type, source_id)
    try:
        src = _load_source(db, source_type, source_id)
    except (FileNotFoundError, OSError) as exc:
        # The source row exists but its bytes are unreadable. That is an ERROR, not
        # a completed ingest: marking it 'done' would strand the row forever (the
        # sweep skips 'done') with no content_hash, so the document would report
        # "queued for indexing" for the rest of time. 'error' keeps it retryable and
        # visible in the admin error list.
        state.status = "error"
        state.attempts = (state.attempts or 0) + 1
        state.error = f"source file unreadable: {exc}"
        db.commit()
        logger.warning("RAG ingest: %s/%s file unreadable: %s", source_type, source_id, exc)
        return 0
    if src is None:
        # The source ROW itself is gone — nothing will ever resolve it. Settle the
        # binding so the sweep stops revisiting it; gc_orphans reaps it later.
        # Existing chunks remain intact so doc-chat still works for shared content.
        if state.status not in ("done", "indexing"):
            state.status = "done"
            state.error = "source record no longer exists"
            db.commit()
        return 0

    if src.content_type not in settings.RAG_ALLOWED_CONTENT_TYPES:
        # Not an indexable type — mark done so the scheduler stops revisiting it.
        state.status = "done"
        state.error = f"skipped: content_type {src.content_type!r} not indexable"
        state.indexed_ts = datetime.now(timezone.utc)
        db.commit()
        return 0

    # Keep the binding's ACL scope + display fresh on every ingest attempt.
    state.course_material_file_id = (
        _uuid.UUID(src.course_material_file_id) if src.course_material_file_id else None
    )
    state.course_instance_id = src.course_instance_id
    state.library_material_id = src.library_material_id
    state.document_title = (src.title or "")[:500]

    content_hash = hashlib.sha256(src.file_bytes).hexdigest()
    old_hash = state.content_hash

    # Already linked to this exact content and the chunks still exist → nothing to
    # do. (Checks chunk existence too, so a binding left 'done' after its content
    # was reaped is correctly re-indexed instead of silently no-oping.)
    if state.status == "done" and old_hash == content_hash and _chunks_exist(db, content_hash):
        db.commit()
        return 0

    # Link-or-index: identical bytes already indexed by another source → just link
    # this binding to the shared content; skip the expensive convert + embed.
    if _chunks_exist(db, content_hash):
        state.status = "done"
        state.content_hash = content_hash
        state.indexed_ts = datetime.now(timezone.utc)
        state.error = None
        db.commit()
        logger.info(
            "RAG ingest: linked %s/%s to existing content %s",
            source_type, source_id, content_hash[:12],
        )
        if old_hash and old_hash != content_hash:
            _gc_content_if_orphan(db, old_hash)
        return 0

    state.status = "indexing"
    state.attempts = (state.attempts or 0) + 1
    state.error = None
    db.commit()

    try:
        docling = DoclingClient()
        try:
            if settings.DOCLING_MODE == "chunk_endpoint":
                chunks = _chunks_from_endpoint(
                    docling.chunk_hybrid(src.file_bytes, src.filename, src.content_type)
                )
            else:
                doc_json = docling.convert_to_docling_json(
                    src.file_bytes, src.filename, src.content_type
                )
                chunks = chunk_docling_json(doc_json)
        finally:
            docling.close()

        if not chunks:
            # Empty conversion is a failure, not success: keep the previously
            # indexed chunks (if any) and let the scheduler retry up to its
            # attempts cap so the operator sees it in the admin error list.
            state.status = "error"
            state.error = "conversion produced no chunks"
            db.commit()
            return 0

        written = _store_chunks(db, content_hash, chunks)

        state.status = "done"
        state.content_hash = content_hash
        state.indexed_ts = datetime.now(timezone.utc)
        state.error = None
        db.commit()
        if old_hash and old_hash != content_hash:
            _gc_content_if_orphan(db, old_hash)
        return written
    except Exception as exc:  # noqa: BLE001 — record and move on
        db.rollback()
        state = _get_or_create_state(db, source_type, source_id)
        state.status = "error"
        state.error = f"{type(exc).__name__}: {exc}"
        db.commit()
        logger.exception("RAG ingest failed for %s/%s", source_type, source_id)
        return 0


def _store_chunks(db: Session, content_hash: str, chunks: list[Chunk]) -> int:
    # Nothing to store → keep whatever is already indexed. Deleting first would
    # silently drop a previously-indexed document whenever a conversion comes
    # back empty (scanned PDF, flaky converter).
    if not chunks:
        return 0

    # Replace any existing chunks for this content (e.g. re-embed after a chunker
    # or model change). Keyed by hash, so this touches only this one document.
    db.query(DocumentChunk).filter(
        DocumentChunk.content_hash == content_hash
    ).delete(synchronize_session=False)

    embed_inputs = [
        normalize_for_embedding(c.embed_text, settings.RAG_ARABIC_NORMALIZE) for c in chunks
    ]
    embedder = make_embedding_client()
    try:
        vectors = embedder.embed_texts(embed_inputs)
    finally:
        embedder.close()

    now = datetime.now(timezone.utc)
    rows = [
        DocumentChunk(
            content_hash=content_hash,
            page_no=c.page_no,
            chunk_index=c.chunk_index,
            content=c.text,
            token_count=None,
            embedding=vec,
            indexed_at=now,
        )
        for c, vec in zip(chunks, vectors)
    ]
    db.add_all(rows)
    db.commit()
    return len(rows)


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------
@dataclass
class SearchResult:
    chunk_id: str
    source_type: str
    document_title: str
    page_no: int | None
    content: str
    score: float
    course_instance_id: int | None
    library_material_id: int | None


def _binding_condition(
    accessible_course_ids: list[int] | None,
    params: dict,
    document: tuple[str, str] | None = None,
) -> str:
    """Access + visibility condition on a binding alias ``s`` (rag_ingestion_state).

    Content chunks no longer carry access columns — the ACL lives on the source
    binding — so search gates a chunk by whether ANY binding the caller may see
    references its ``content_hash``. This condition selects those bindings: only
    ``done`` ones; course bindings need an accessible AND currently-approved
    instance (un-approving hides its content); library bindings follow the live
    _can_view rule. Expects ``is_lib_mgr``/``full_name`` in ``params`` already.

    ``document`` = (source_type, id) narrows to ONE document via the binding's
    indexed source columns. The ACL still applies — scoping never widens access.

    ``hidden`` gates aggregate search only. It is a curation flag, not an ACL, and a
    doc-scoped caller has explicitly opened that document in the viewer — so it must
    not silence their chat."""
    if accessible_course_ids is None:
        course_pred = "TRUE"
    elif len(accessible_course_ids) == 0:
        course_pred = "FALSE"
    else:
        course_pred = "s.course_instance_id = ANY(:course_ids)"
        params["course_ids"] = accessible_course_ids
    visibility = "" if document is not None else " AND s.hidden = false"
    cond = f"""s.status = 'done'{visibility} AND (
          (s.source_type = 'course_material' AND ({course_pred}) AND EXISTS (
             SELECT 1 FROM course_instances ci
             WHERE ci.id = s.course_instance_id AND ci.status = 'approved'
          ))
          OR
          (s.source_type = 'library' AND EXISTS (
             SELECT 1 FROM library_materials lm
             WHERE lm.id = s.library_material_id AND (
                :is_lib_mgr
                OR (lm.uploaded_by IS NOT NULL AND lm.uploaded_by = :full_name)
                OR (lm.material_type <> 'personal' AND lm.approved_status = 'approved')
             )
          ))
        )"""
    if document is not None:
        doc_type, doc_id = document
        if doc_type == SOURCE_LIBRARY:
            cond += " AND s.source_type = 'library' AND s.library_material_id = :doc_library_id"
            params["doc_library_id"] = int(doc_id)
        elif doc_type == SOURCE_COURSE_MATERIAL:
            cond += (
                " AND s.source_type = 'course_material'"
                " AND s.course_material_file_id = CAST(:doc_file_id AS uuid)"
            )
            params["doc_file_id"] = str(doc_id)
        else:
            # Unknown scope: return nothing rather than silently widening.
            cond += " AND FALSE"
    return cond


def _exists_access(cond: str, outer: str = "c") -> str:
    """WHERE gate: a chunk is visible iff some accessible binding references it."""
    return (
        "EXISTS (SELECT 1 FROM rag_ingestion_state s "
        f"WHERE s.content_hash = {outer}.content_hash AND {cond})"
    )


def _binding_display_join(cond: str, outer: str = "c") -> str:
    """LATERAL join yielding ONE accessible binding's display/source fields (alias
    ``b``) for a candidate chunk — the source_type/title/scope shown to the caller.
    LEFT JOIN so an accessible chunk is never dropped; the condition matches the
    access gate, so a visible chunk always has a binding here."""
    return (
        "LEFT JOIN LATERAL ("
        "SELECT s.source_type, s.document_title, s.course_instance_id, s.library_material_id "
        "FROM rag_ingestion_state s "
        f"WHERE s.content_hash = {outer}.content_hash AND {cond} "
        "ORDER BY s.indexed_ts DESC NULLS LAST LIMIT 1"
        ") b ON true"
    )


def search(
    db: Session,
    query: str,
    *,
    accessible_course_ids: list[int] | None,
    is_library_manager: bool,
    full_name: str | None,
    top_k: int | None = None,
    min_score: float | None = None,
    document: tuple[str, str] | None = None,
) -> list[SearchResult]:
    """Semantic search over indexed chunks, filtered by the caller's access.

    ``accessible_course_ids`` follows the agent convention: ``None`` = all
    courses (course:read / admin:full), ``[]`` = no course access, otherwise the
    explicit instance-id allow-list.

    ``document`` = (source_type, id) restricts results to that one document
    (per-document chat); the normal ACL still applies on top.
    """
    q = (query or "").strip()
    if not q:
        return []

    top_k = top_k or settings.RAG_SEARCH_TOP_K
    min_score = settings.RAG_MIN_SCORE if min_score is None else min_score

    embedder = make_embedding_client()
    try:
        qvec = embedder.embed_query(normalize_for_embedding(q, settings.RAG_ARABIC_NORMALIZE))
    finally:
        embedder.close()
    qvec_literal = "[" + ",".join(f"{x:.7f}" for x in qvec) + "]"

    params: dict = {
        "qvec": qvec_literal,
        "top_k": top_k,
        "is_lib_mgr": is_library_manager,
        "full_name": full_name,
    }

    cond = _binding_condition(accessible_course_ids, params, document=document)
    access = _exists_access(cond)

    if settings.RAG_HYBRID_ENABLED:
        # Hybrid: rank a dense (vector) branch and a keyword (FTS) branch, then
        # fuse by Reciprocal Rank Fusion. The returned `score` is still cosine
        # similarity (interpretable / for min_score); ordering is by RRF. The
        # display binding is joined only on the fused candidates (via ``cand``),
        # never the whole table.
        params["kwquery"] = q
        params["rrf_k"] = settings.RAG_RRF_K
        params["cand"] = max(settings.RAG_HYBRID_CANDIDATES, top_k)
        display = _binding_display_join(cond, outer="cand")
        sql = text(
            f"""
            WITH dense AS (
                SELECT c.id,
                       row_number() OVER (ORDER BY c.embedding <=> CAST(:qvec AS vector)) AS rnk
                FROM document_chunks c
                WHERE {access}
                ORDER BY c.embedding <=> CAST(:qvec AS vector)
                LIMIT :cand
            ),
            kw AS (
                SELECT c.id,
                       row_number() OVER (
                           ORDER BY ts_rank(c.tsv, websearch_to_tsquery('simple', :kwquery)) DESC
                       ) AS rnk
                FROM document_chunks c
                WHERE {access} AND c.tsv @@ websearch_to_tsquery('simple', :kwquery)
                LIMIT :cand
            ),
            cand AS (
                SELECT c.id, c.content_hash, c.page_no, c.content, c.embedding,
                       dense.rnk AS drnk, kw.rnk AS krnk
                FROM document_chunks c
                LEFT JOIN dense ON dense.id = c.id
                LEFT JOIN kw ON kw.id = c.id
                WHERE dense.id IS NOT NULL OR kw.id IS NOT NULL
            )
            SELECT cand.id, b.source_type, b.document_title, cand.page_no, cand.content,
                   b.course_instance_id, b.library_material_id,
                   (1 - (cand.embedding <=> CAST(:qvec AS vector))) AS score
            FROM cand
            {display}
            ORDER BY (COALESCE(1.0 / (:rrf_k + cand.drnk), 0)
                    + COALESCE(1.0 / (:rrf_k + cand.krnk), 0)) DESC
            LIMIT :top_k
            """
        )
    else:
        display = _binding_display_join(cond, outer="cand")
        sql = text(
            f"""
            WITH cand AS (
                SELECT c.id, c.content_hash, c.page_no, c.content, c.embedding
                FROM document_chunks c
                WHERE {access}
                ORDER BY c.embedding <=> CAST(:qvec AS vector)
                LIMIT :top_k
            )
            SELECT cand.id, b.source_type, b.document_title, cand.page_no, cand.content,
                   b.course_instance_id, b.library_material_id,
                   1 - (cand.embedding <=> CAST(:qvec AS vector)) AS score
            FROM cand
            {display}
            ORDER BY cand.embedding <=> CAST(:qvec AS vector)
            LIMIT :top_k
            """
        )

    rows = db.execute(sql, params).mappings().all()
    results: list[SearchResult] = []
    for r in rows:
        score = float(r["score"]) if r["score"] is not None else 0.0
        if score < min_score:
            continue
        results.append(
            SearchResult(
                chunk_id=str(r["id"]),
                source_type=r["source_type"],
                document_title=r["document_title"],
                page_no=r["page_no"],
                content=r["content"],
                score=score,
                course_instance_id=r["course_instance_id"],
                library_material_id=r["library_material_id"],
            )
        )
    return results


def document_index_status(db: Session, source_type: str, source_id: str) -> tuple[bool, str]:
    """Whether one document is searchable, and if not, the human reason why.

    Used by the doc-chat's search_materials tool so the agent can tell the
    user "not indexed until the course is approved" instead of pretending the
    document is empty. Reasons are user-facing sentences (the LLM relays them).
    """
    state = _get_state(db, source_type, source_id)

    # Eligibility FIRST. A binding can be 'done' with live chunks and still be
    # invisible to search — a course material whose instance was un-approved is
    # exactly that. Declaring it "indexed" would hand the agent an empty result set
    # with no explanation, so the user hears "there is nothing in this document"
    # instead of "wait for the course to be approved".
    if source_type == SOURCE_COURSE_MATERIAL:
        import uuid as _uuid

        from app.modules.course.models import CourseInstance
        from app.modules.course_selection_material.models import CourseSelectionMaterialFile

        try:
            file_id = _uuid.UUID(source_id)
        except (TypeError, ValueError):
            return False, "the document could not be found"
        file = db.get(CourseSelectionMaterialFile, file_id)
        if file is None:
            return False, "the document no longer exists"
        if file.content_type not in settings.RAG_ALLOWED_CONTENT_TYPES:
            return False, (
                "this file type is not searchable (only PDF, Office and text documents are indexed)"
            )
        instance = db.get(CourseInstance, file.course_instance_id)
        if instance is None or instance.status != "approved":
            return False, (
                "not indexed yet — course materials become searchable after the course is approved"
            )
    elif source_type == SOURCE_LIBRARY:
        from app.modules.library.models import LibraryMaterial

        try:
            material_id = int(source_id)
        except (TypeError, ValueError):
            return False, "the document could not be found"
        material = db.get(LibraryMaterial, material_id)
        if material is None:
            return False, "the document no longer exists"
        if material.content_type not in settings.RAG_ALLOWED_CONTENT_TYPES:
            return False, (
                "this file type is not searchable (only PDF, Office and text documents are indexed)"
            )
        if material.material_type == "personal":
            return False, "personal library documents are not indexed for search"
        if material.approved_status != "approved":
            return False, (
                "not indexed yet — library documents become searchable after they are approved"
            )
    else:
        return False, "the document could not be found"

    # Eligible → searchable iff the binding is done and the shared content still
    # exists (a state/chunk desync counts as not-indexed rather than a lie).
    # ``hidden`` is deliberately NOT consulted: it curates aggregate search, and the
    # caller has this very document open in the viewer.
    if state is not None and state.status == "done" and _chunks_exist(db, state.content_hash):
        return True, "indexed"
    if state is not None and state.status == "indexing":
        return False, "being indexed right now — try again in a few minutes"
    if state is not None and state.status == "error":
        return False, "indexing failed for this document — an administrator can retry it"
    return False, "queued for indexing — try again in a few minutes"


# ---------------------------------------------------------------------------
# Admin / inspection
# ---------------------------------------------------------------------------
def admin_stats(db: Session) -> dict:
    total = db.query(func.count(DocumentChunk.id)).scalar() or 0
    # Chunks reachable via each source type. Content is shared, so a chunk bound by
    # both a course and a library source counts under each.
    by_source = {
        row[0]: row[1]
        for row in db.execute(
            text(
                "SELECT s.source_type, count(DISTINCT c.id) "
                "FROM document_chunks c "
                "JOIN rag_ingestion_state s ON s.content_hash = c.content_hash "
                "WHERE s.status = 'done' "
                "GROUP BY s.source_type"
            )
        ).all()
    }
    course_docs = (
        db.query(func.count(func.distinct(RagIngestionState.course_material_file_id)))
        .filter(
            RagIngestionState.source_type == SOURCE_COURSE_MATERIAL,
            RagIngestionState.status == "done",
        )
        .scalar()
        or 0
    )
    library_docs = (
        db.query(func.count(func.distinct(RagIngestionState.library_material_id)))
        .filter(
            RagIngestionState.source_type == SOURCE_LIBRARY,
            RagIngestionState.status == "done",
            RagIngestionState.hidden.is_(False),
        )
        .scalar()
        or 0
    )
    # Dedup savings: how many done source bindings reuse content that another
    # binding already indexed (= convert + embed passes avoided).
    done_bindings = (
        db.query(func.count(RagIngestionState.id))
        .filter(RagIngestionState.status == "done")
        .scalar()
        or 0
    )
    unique_contents = (
        db.query(func.count(func.distinct(RagIngestionState.content_hash)))
        .filter(
            RagIngestionState.status == "done",
            RagIngestionState.content_hash.isnot(None),
        )
        .scalar()
        or 0
    )
    # Same population as the Ingestion page (progress_counts) — a raw histogram of
    # rag_ingestion_state would count bindings for deleted sources as "pending",
    # showing work that will never be done and disagreeing with the other page.
    ingestion = progress_counts(db)
    errors = ingestion_errors(db)
    return {
        "total_chunks": total,
        "chunks_by_source": by_source,
        "documents": {"course_material": course_docs, "library": library_docs},
        "source_bindings": done_bindings,
        "unique_contents": unique_contents,
        "deduplicated_documents": max(0, done_bindings - unique_contents),
        "ingestion_by_status": ingestion,
        "orphan_bindings": orphan_binding_count(db),
        "errors": errors,
    }


# A source file's progress state, derived by walking OUT from the eligible sources
# rather than counting binding rows. Counting bindings mixes populations: it includes
# bindings for deleted sources and for course instances that are no longer approved,
# so the totals stop agreeing with the work actually left to do.
#
# 'done' requires a content_hash: a binding left 'done' with no hash indexed nothing,
# so it is remaining work, not a success (the sweep re-attempts it — see
# scheduler._skip_source_ids).
_PROGRESS_STATE = (
    "CASE WHEN s.id IS NULL THEN 'pending' "
    "     WHEN s.status = 'done' AND s.content_hash IS NULL THEN 'pending' "
    "     ELSE s.status END"
)

_PROGRESS_COURSE_SQL = f"""
    SELECT {_PROGRESS_STATE} AS st, count(*) AS n
    FROM course_selection_material_files f
    JOIN course_instances ci ON ci.id = f.course_instance_id AND ci.status = 'approved'
    LEFT JOIN rag_ingestion_state s
           ON s.source_type = 'course_material' AND s.source_id = f.id::text
    WHERE f.content_type = ANY(:allowed)
    GROUP BY 1
"""

_PROGRESS_LIBRARY_SQL = f"""
    SELECT {_PROGRESS_STATE} AS st, count(*) AS n
    FROM library_materials m
    LEFT JOIN rag_ingestion_state s
           ON s.source_type = 'library' AND s.source_id = m.id::text
    WHERE m.approved_status = 'approved' AND m.material_type <> 'personal'
      AND m.file_url IS NOT NULL AND m.content_type = ANY(:allowed)
    GROUP BY 1
"""


def progress_counts(db: Session) -> dict[str, int]:
    """Status histogram over the sources RAG is actually supposed to index."""
    allowed = list(settings.RAG_ALLOWED_CONTENT_TYPES)
    counts: dict[str, int] = {}
    for sql in (_PROGRESS_COURSE_SQL, _PROGRESS_LIBRARY_SQL):
        for st, n in db.execute(text(sql), {"allowed": allowed}).all():
            counts[st] = counts.get(st, 0) + n
    return counts


def ingestion_errors(db: Session, limit: int = 50) -> list[dict]:
    """The failures behind the `error` count, newest first — what actually went wrong
    per source. Shared by the Overview and Ingestion pages so both tell one story."""
    return [
        {
            "source_type": s.source_type,
            "source_id": s.source_id,
            "attempts": s.attempts,
            "error": s.error,
        }
        for s in db.query(RagIngestionState)
        .filter(RagIngestionState.status == "error")
        .order_by(RagIngestionState.updated_at.desc())
        .limit(limit)
        .all()
    ]


def orphan_binding_count(db: Session) -> int:
    """Bindings whose source row no longer exists. They are dead weight, never
    indexable, and reaped by gc_orphans — so they are reported on their own rather
    than leaking into 'pending' as work that will never happen."""
    return db.execute(
        text(
            "SELECT count(*) FROM rag_ingestion_state s WHERE "
            "(s.source_type = 'course_material' AND NOT EXISTS ("
            "   SELECT 1 FROM course_selection_material_files f WHERE f.id::text = s.source_id)) "
            "OR (s.source_type = 'library' AND NOT EXISTS ("
            "   SELECT 1 FROM library_materials m WHERE m.id::text = s.source_id))"
        )
    ).scalar() or 0


def ingestion_progress(db: Session) -> dict:
    """Aggregate ingestion progress. Read-only."""
    counts = progress_counts(db)
    return {
        "total": sum(counts.values()),
        "indexed": counts.get("done", 0),
        "pending": counts.get("pending", 0),
        "indexing": counts.get("indexing", 0),
        "error": counts.get("error", 0),
        "orphan_bindings": orphan_binding_count(db),
        "last_indexed_at": db.query(func.max(RagIngestionState.indexed_ts)).scalar(),
        "errors": ingestion_errors(db),
    }


# Columns returned for the admin chunk inspector: chunk payload + ONE representative
# binding (source/title/scope). A chunk shared by many sources shows once, via its
# most recently indexed binding.
_CHUNK_META_COLUMNS = (
    "c.id AS chunk_id, c.content_hash, c.page_no, c.chunk_index, c.content, c.indexed_at, "
    "s.source_type, s.document_title, s.course_instance_id, s.library_material_id"
)


def list_chunks(
    db: Session,
    *,
    source_type: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
):
    """Admin inspector listing: one row per chunk with a representative *done*
    binding. Filters (source_type / title) apply to the binding."""
    where = ["s.status = 'done'"]
    params: dict = {}
    if source_type:
        where.append("s.source_type = :st")
        params["st"] = source_type
    if q:
        where.append("s.document_title ILIKE :q")
        params["q"] = f"%{q}%"
    where_sql = " AND ".join(where)
    base = (
        f"SELECT DISTINCT ON (c.id) {_CHUNK_META_COLUMNS} "
        "FROM document_chunks c "
        "JOIN rag_ingestion_state s ON s.content_hash = c.content_hash "
        f"WHERE {where_sql} "
        "ORDER BY c.id, s.indexed_ts DESC NULLS LAST"
    )
    total = db.execute(text(f"SELECT count(*) FROM ({base}) t"), params).scalar() or 0
    rows = db.execute(
        text(
            f"SELECT * FROM ({base}) t "
            "ORDER BY t.document_title NULLS LAST, t.chunk_index "
            "OFFSET :off LIMIT :lim"
        ),
        {**params, "off": max(0, (page - 1)) * page_size, "lim": page_size},
    ).mappings().all()
    return rows, total


def get_chunk(db: Session, chunk_id: str):
    import uuid as _uuid

    try:
        cid = _uuid.UUID(chunk_id)
    except (ValueError, TypeError):
        return None
    return db.execute(
        text(
            f"SELECT DISTINCT ON (c.id) {_CHUNK_META_COLUMNS} "
            "FROM document_chunks c "
            "LEFT JOIN rag_ingestion_state s "
            "  ON s.content_hash = c.content_hash AND s.status = 'done' "
            "WHERE c.id = CAST(:cid AS uuid) "
            "ORDER BY c.id, s.indexed_ts DESC NULLS LAST"
        ),
        {"cid": str(cid)},
    ).mappings().first()


@dataclass
class DebugHit:
    chunk_id: str
    source_type: str
    document_title: str
    page_no: int | None
    content: str
    cosine: float | None
    dense_rank: int | None
    kw_rank: int | None
    rrf_score: float | None
    course_instance_id: int | None
    library_material_id: int | None


def search_debug(
    db: Session,
    query: str,
    *,
    accessible_course_ids: list[int] | None,
    is_library_manager: bool,
    full_name: str | None,
    top_k: int | None = None,
    hybrid: bool | None = None,
) -> list[DebugHit]:
    """Like search() but exposes the dense rank, keyword rank and RRF score of
    each hit — for the admin query playground. Access params work the same; pass
    accessible_course_ids=None + is_library_manager=True for an unrestricted
    (see-all) test run."""
    q = (query or "").strip()
    if not q:
        return []
    top_k = top_k or settings.RAG_SEARCH_TOP_K
    hybrid = settings.RAG_HYBRID_ENABLED if hybrid is None else hybrid

    embedder = make_embedding_client()
    try:
        qvec = embedder.embed_query(normalize_for_embedding(q, settings.RAG_ARABIC_NORMALIZE))
    finally:
        embedder.close()
    qvec_literal = "[" + ",".join(f"{x:.7f}" for x in qvec) + "]"

    params: dict = {
        "qvec": qvec_literal,
        "top_k": top_k,
        "is_lib_mgr": is_library_manager,
        "full_name": full_name,
    }
    cond = _binding_condition(accessible_course_ids, params)
    access = _exists_access(cond)
    display = _binding_display_join(cond, outer="cand")

    if hybrid:
        params["kwquery"] = q
        params["rrf_k"] = settings.RAG_RRF_K
        params["cand"] = max(settings.RAG_HYBRID_CANDIDATES, top_k)
        sql = text(
            f"""
            WITH dense AS (
                SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> CAST(:qvec AS vector)) AS rnk
                FROM document_chunks c WHERE {access}
                ORDER BY c.embedding <=> CAST(:qvec AS vector) LIMIT :cand
            ),
            kw AS (
                SELECT c.id, row_number() OVER (
                    ORDER BY ts_rank(c.tsv, websearch_to_tsquery('simple', :kwquery)) DESC) AS rnk
                FROM document_chunks c
                WHERE {access} AND c.tsv @@ websearch_to_tsquery('simple', :kwquery) LIMIT :cand
            ),
            cand AS (
                SELECT c.id, c.content_hash, c.page_no, c.content, c.embedding,
                       dense.rnk AS drnk, kw.rnk AS krnk
                FROM document_chunks c
                LEFT JOIN dense ON dense.id = c.id
                LEFT JOIN kw ON kw.id = c.id
                WHERE dense.id IS NOT NULL OR kw.id IS NOT NULL
            )
            SELECT cand.id, b.source_type, b.document_title, cand.page_no, cand.content,
                   b.course_instance_id, b.library_material_id,
                   (1 - (cand.embedding <=> CAST(:qvec AS vector))) AS cosine,
                   cand.drnk AS dense_rank, cand.krnk AS kw_rank,
                   (COALESCE(1.0 / (:rrf_k + cand.drnk), 0)
                  + COALESCE(1.0 / (:rrf_k + cand.krnk), 0)) AS rrf_score
            FROM cand
            {display}
            ORDER BY rrf_score DESC LIMIT :top_k
            """
        )
    else:
        sql = text(
            f"""
            WITH cand AS (
                SELECT c.id, c.content_hash, c.page_no, c.content, c.embedding,
                       row_number() OVER (ORDER BY c.embedding <=> CAST(:qvec AS vector)) AS dense_rank
                FROM document_chunks c WHERE {access}
                ORDER BY c.embedding <=> CAST(:qvec AS vector) LIMIT :top_k
            )
            SELECT cand.id, b.source_type, b.document_title, cand.page_no, cand.content,
                   b.course_instance_id, b.library_material_id,
                   (1 - (cand.embedding <=> CAST(:qvec AS vector))) AS cosine,
                   cand.dense_rank AS dense_rank, NULL::int AS kw_rank, NULL::float AS rrf_score
            FROM cand
            {display}
            ORDER BY cand.embedding <=> CAST(:qvec AS vector) LIMIT :top_k
            """
        )

    rows = db.execute(sql, params).mappings().all()
    return [
        DebugHit(
            chunk_id=str(r["id"]),
            source_type=r["source_type"],
            document_title=r["document_title"],
            page_no=r["page_no"],
            content=r["content"],
            cosine=float(r["cosine"]) if r["cosine"] is not None else None,
            dense_rank=r["dense_rank"],
            kw_rank=r["kw_rank"],
            rrf_score=float(r["rrf_score"]) if r["rrf_score"] is not None else None,
            course_instance_id=r["course_instance_id"],
            library_material_id=r["library_material_id"],
        )
        for r in rows
    ]
