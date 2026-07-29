"""APScheduler job runner for RAG ingestion.

Mirrors ``library/scheduler.py``: a periodic backfill sweep that picks up
un-indexed source files (crash recovery + backlog), plus one-shot fire-and-forget
triggers used on the course-approval hook. Course materials are only indexed once
their course instance is ``approved``; library docs when approved & non-personal.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.modules.rag.models import (
    SOURCE_COURSE_MATERIAL,
    SOURCE_LIBRARY,
    RagIngestionState,
)
from app.modules.rag.services import ingest_source_file

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None
_active: set[str] = set()
_backfill_running: bool = False
_MAX_ERROR_ATTEMPTS = 5

# Cross-process leader election: only the process holding this Postgres advisory
# lock runs the sweep, so `uvicorn --workers N` doesn't spawn N schedulers that
# duplicate ingestion and race on document_chunks. The lock is session-scoped —
# held on a dedicated connection kept open for the process lifetime.
_ADVISORY_LOCK_KEY = 0x524147494458  # "RAGIDX"
_lock_conn = None


def _acquire_leader_lock() -> bool:
    global _lock_conn
    try:
        conn = engine.connect()
        got = conn.execute(
            text("SELECT pg_try_advisory_lock(:k)"), {"k": _ADVISORY_LOCK_KEY}
        ).scalar()
        if got:
            _lock_conn = conn  # keep open to hold the lock
            return True
        conn.close()
    except Exception:
        logger.exception("RAG scheduler: failed to acquire leader lock")
    return False


def active_count() -> int:
    return len(_active)


def is_running() -> bool:
    """Whether a backfill sweep is currently executing (or files in flight)."""
    return _backfill_running or len(_active) > 0


def _skip_source_ids(db, source_type: str) -> set[str]:
    """Source ids that should not be (re)processed by the backfill sweep:
    already done, currently indexing, or errored past the retry cap.

    A 'done' row with no content_hash indexed nothing — it is a settled failure, not
    a success — so it is NOT skipped. Skipping it would strand the document forever:
    the sweep passes over it while doc-chat keeps reporting "queued for indexing".
    (The sources whose row is genuinely gone never reach here — the callers only list
    sources that still exist.)
    """
    rows = db.query(
        RagIngestionState.source_id,
        RagIngestionState.status,
        RagIngestionState.attempts,
        RagIngestionState.content_hash,
    ).filter(RagIngestionState.source_type == source_type).all()
    skip: set[str] = set()
    for source_id, status, attempts, content_hash in rows:
        if status == "done" and content_hash:
            skip.add(source_id)
        elif status == "indexing":
            skip.add(source_id)
        elif status == "error" and (attempts or 0) >= _MAX_ERROR_ATTEMPTS:
            skip.add(source_id)
    return skip


def _pending_course_material(db) -> list[str]:
    from app.modules.course.models import CourseInstance
    from app.modules.course_selection_material.models import CourseSelectionMaterialFile

    allowed = list(settings.RAG_ALLOWED_CONTENT_TYPES)
    files = (
        db.query(CourseSelectionMaterialFile.id)
        .join(CourseInstance, CourseInstance.id == CourseSelectionMaterialFile.course_instance_id)
        .filter(
            CourseInstance.status == "approved",
            CourseSelectionMaterialFile.content_type.in_(allowed),
        )
        .all()
    )
    skip = _skip_source_ids(db, SOURCE_COURSE_MATERIAL)
    return [str(fid) for (fid,) in files if str(fid) not in skip]


def _pending_library(db) -> list[str]:
    from app.modules.rag.services import eligible_library_materials

    skip = _skip_source_ids(db, SOURCE_LIBRARY)
    return [
        str(m.id) for m in eligible_library_materials(db) if str(m.id) not in skip
    ]


def _index_one(db, source_type: str, source_id: str) -> None:
    key = f"{source_type}:{source_id}"
    if key in _active:
        logger.info("RAG index: already active, skipping %s", key)
        return
    _active.add(key)
    logger.info("RAG index started: %s (file %s)", source_type, source_id)
    try:
        written = ingest_source_file(db, source_type, source_id)
        logger.info("RAG index done: %s → %d chunks", source_id, written)
    except Exception:
        logger.exception("RAG index failed for %s", key)
    finally:
        _active.discard(key)


def _reset_stale_indexing(db) -> None:
    """Reset rows stuck in 'indexing' back to 'pending'.

    'indexing' is committed before the (long) convert+embed work, so a process
    crash mid-ingest strands the row there — and the sweep skips 'indexing'
    forever. Age is measured on updated_at (touched by the status flip). Rows
    genuinely in flight in this process are protected by the _active guard in
    _index_one, and the threshold far exceeds a normal ingest.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(
        minutes=settings.RAG_STALE_INDEXING_MINUTES
    )
    stale = (
        db.query(RagIngestionState)
        .filter(RagIngestionState.status == "indexing", RagIngestionState.updated_at < cutoff)
        .all()
    )
    for state in stale:
        logger.warning(
            "RAG sweep: resetting stale 'indexing' row %s/%s (stuck since %s)",
            state.source_type, state.source_id, state.updated_at,
        )
        state.status = "pending"
    if stale:
        db.commit()


def _run_backfill() -> None:
    """Periodic sweep: index every approved, indexable, un-indexed source file."""
    global _backfill_running
    if not settings.RAG_ENABLED:
        return
    _backfill_running = True
    db = SessionLocal()
    try:
        _reset_stale_indexing(db)
        for source_id in _pending_course_material(db):
            _index_one(db, SOURCE_COURSE_MATERIAL, source_id)
        for source_id in _pending_library(db):
            _index_one(db, SOURCE_LIBRARY, source_id)
        # Reclaim bindings/content left by deleted or re-pointed sources (there is
        # no FK cascade from the source tables to the deduplicated content).
        try:
            from app.modules.rag.services import gc_orphans

            removed_bindings, removed_chunks = gc_orphans(db)
            if removed_bindings or removed_chunks:
                logger.info(
                    "RAG gc: removed %d orphan bindings, %d orphan chunks",
                    removed_bindings, removed_chunks,
                )
        except Exception:
            logger.exception("RAG gc: orphan sweep failed")
    finally:
        db.close()
        _backfill_running = False


def _index_course_instance_in_thread(course_instance_id: int) -> None:
    from app.modules.course_selection_material.models import CourseSelectionMaterialFile

    db = SessionLocal()
    try:
        allowed = list(settings.RAG_ALLOWED_CONTENT_TYPES)
        files = (
            db.query(CourseSelectionMaterialFile.id)
            .filter(
                CourseSelectionMaterialFile.course_instance_id == course_instance_id,
                CourseSelectionMaterialFile.content_type.in_(allowed),
            )
            .all()
        )
        for (fid,) in files:
            _index_one(db, SOURCE_COURSE_MATERIAL, str(fid))
    finally:
        db.close()


def trigger_index_course_instance(course_instance_id: int) -> None:
    """Fire-and-forget: index all material files of a just-approved instance."""
    if not settings.RAG_ENABLED or _scheduler is None:
        return
    _scheduler.add_job(
        _index_course_instance_in_thread,
        "date",
        run_date=datetime.now(timezone.utc) + timedelta(seconds=5),
        args=[course_instance_id],
        id=f"rag_index_course_{course_instance_id}",
        replace_existing=True,
    )
    logger.info("Triggered RAG indexing for course instance %s in 5s", course_instance_id)


def _index_source_in_thread(source_type: str, source_id: str) -> None:
    db = SessionLocal()
    try:
        _index_one(db, source_type, source_id)
    finally:
        db.close()


def trigger_index_source(source_type: str, source_id: str) -> None:
    """Fire-and-forget: index one source file (used by admin reindex)."""
    if not settings.RAG_ENABLED or _scheduler is None:
        return
    _scheduler.add_job(
        _index_source_in_thread,
        "date",
        run_date=datetime.now(timezone.utc) + timedelta(seconds=2),
        args=[source_type, source_id],
        id=f"rag_index_{source_type}_{source_id}",
        replace_existing=True,
    )


def unavailable_reason() -> str | None:
    """Why a manual trigger would quietly do nothing here, or None if it will run.

    Without this the API answers 200 either way and the operator cannot tell a
    scheduled sweep from a click that was silently dropped.
    """
    if not settings.RAG_ENABLED:
        return "RAG is disabled on this server (RAG_ENABLED=false)."
    if not settings.RAG_SCHEDULER_ENABLED:
        return "The ingestion scheduler is disabled on this server (RAG_SCHEDULER_ENABLED=false)."
    if _scheduler is None:
        return (
            "This worker is not the ingestion leader, so it cannot start a sweep. "
            "The leader will pick the work up on its next scheduled sweep."
        )
    return None


def trigger_backfill() -> bool:
    """Fire-and-forget: run a full backfill sweep now (don't wait for the
    interval). Returns True if scheduled."""
    if not settings.RAG_ENABLED or _scheduler is None:
        return False
    _scheduler.add_job(
        _run_backfill,
        "date",
        run_date=datetime.now(timezone.utc) + timedelta(seconds=2),
        id="rag_backfill_now",
        replace_existing=True,
    )
    logger.info("Triggered RAG backfill sweep in 2s")
    return True


def start_scheduler() -> None:
    """Start the RAG ingestion scheduler (idempotent).

    No-op if RAG or the scheduler is disabled, or if another process already
    holds the leader lock (so only one worker sweeps). Manual triggers on a
    non-leader worker no-op and are caught by the leader's periodic sweep.
    """
    global _scheduler
    if _scheduler is not None:
        return
    if not settings.RAG_ENABLED or not settings.RAG_SCHEDULER_ENABLED:
        logger.info("RAG ingestion scheduler disabled for this process")
        return
    if not _acquire_leader_lock():
        logger.info("RAG ingestion scheduler: another worker is leader — not sweeping here")
        return
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        _run_backfill,
        "interval",
        seconds=settings.RAG_INGEST_INTERVAL_SECONDS,
        id="rag_backfill",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("RAG ingestion scheduler started (leader)")


def stop_scheduler() -> None:
    global _scheduler, _lock_conn
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
    if _lock_conn is not None:
        try:
            _lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _ADVISORY_LOCK_KEY})
        except Exception:
            pass
        try:
            _lock_conn.close()
        except Exception:
            pass
        _lock_conn = None
    _active.clear()
