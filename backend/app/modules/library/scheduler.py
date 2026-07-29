"""APScheduler job runner for document summarization."""
import logging
import threading
from datetime import datetime, timezone
from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import settings
from app.core.database import SessionLocal
from .common import manager
from .models import MaterialSummary
from .services import _process_batch_result, summarize_material
from .summarizer_client import SummarizerClient

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None
_active_materials: set[int] = set()


def _record_failure(db, material_id: int, exc: Exception) -> None:
    """Record summarization failure so the frontend shows an error and stops polling."""
    from .models import LibraryMaterial

    summary = db.query(MaterialSummary).filter(
        MaterialSummary.id == material_id
    ).first()
    if summary is None:
        return

    # Try to verify the actual file exists on disk using the correct storage backend
    from app.modules.file_sharing.storage import FilesystemStorage, get_storage_backend
    import app.core.config as config
    file_missing = True
    try:
        backend_map = {"course": FilesystemStorage(
            config.settings.MATERIAL_UPLOAD_DIR)}
        backend_map["library"] = get_storage_backend()
        backend = backend_map.get(summary.material_type, get_storage_backend())
        mat = db.query(LibraryMaterial).filter(
            LibraryMaterial.id == material_id).first()
        if mat and mat.file_url:
            path = backend.get_absolute_path(mat.file_url)
            file_missing = not path.exists()
        else:
            file_missing = True
    except Exception:
        file_missing = True

    if isinstance(exc, FileNotFoundError) or file_missing:
        summary.error_message = "Source file not found on disk"
    else:
        summary.error_message = f"Summarization failed: {type(exc).__name__}: {exc}"

    summary.summarize_ts = datetime.now(timezone.utc)


def _run_summarize() -> None:
    """Startup crash-recovery: resume pending batch tasks from the summarizer.

    Strategy:
      - Rows without a task_id → silently ignored (will be created normally
        when a user triggers summarization from the frontend).
      - Rows with a task_id → query the summarizer's /tasks/{task_id} endpoint.
        * status == "completed": fetch result, process it, set summarize_ts.
        * status == "failed": set error_message + summarize_ts so the frontend
          can surface the error.
        * status in ("pending", "processing"): do nothing — summarizer is
          still working, the webhook will arrive eventually.
      - Only ONE recovery is run at startup; repeated server restarts are
        idempotent because _process_batch_result() is idempotent and
        summarize_ts != None guards against re-processing.
    """
    client = SummarizerClient(api_key=settings.DOC_SUMMARY_API_KEY or None)
    db = SessionLocal()
    try:
        summaries = db.query(MaterialSummary).filter(
            MaterialSummary.summarize_ts.is_(None),
            MaterialSummary.task_id.isnot(None),
        ).all()
        if not summaries:
            logger.info("No pending summaries to recover at startup")
            return

        logger.info("Startup recovery: %d pending summary(s) to check", len(summaries))
        for summary in summaries:
            if summary.id in _active_materials:
                continue
            _active_materials.add(summary.id)
            try:
                task_id = summary.task_id
                status_data = client.get_batch_task_status(task_id)
                if status_data is None:
                    logger.warning(
                        "Cannot reach summarizer for task %s — will retry next restart",
                        task_id)
                    continue

                status = status_data.get("status", "")

                if status == "completed":
                    result = status_data.get("result") or {}
                    _process_batch_result(
                        db, summary, result, settings.DOC_SUMMARY_API_KEY or None)
                    summary.summarize_ts = datetime.now(timezone.utc)
                    summary.error_message = None
                    db.commit()
                    logger.info("Recovery completed task %s for material %s", task_id, summary.id)

                elif status == "failed":
                    summary.error_message = status_data.get("error_msg") or "Batch task failed"
                    summary.summarize_ts = datetime.now(timezone.utc)
                    db.commit()
                    logger.warning(
                        "Recovery: task %s failed for material %s", task_id, summary.id)

                else:
                    # pending / processing — summarizer still working
                    logger.debug(
                        "Task %s still %s for material %s — skipping",
                        task_id, status, summary.id)

            except Exception:
                logger.exception("Recovery failed for task %s", summary.task_id)
    finally:
        db.close()
        _active_materials.clear()


def _run_summarize_in_thread(material_id: int) -> None:
    """One-shot worker for trigger_summarize — creates its own DB session."""
    db = SessionLocal()
    try:
        summarize_material(db, material_id)
        logger.info("Batch task submitted for material %s, waiting for webhook", material_id)
    except Exception as e:
        logger.exception("Failed to summarize material %s", material_id)
        _record_failure(db, material_id, e)
    finally:
        db.close()
    manager.push_status_sync(material_id)


def trigger_summarize(material_id: int) -> None:
    """Submit material for summarization immediately (fire-and-forget).

    Runs in a background thread so the HTTP request returns instantly.
    The summarizer service sends results back via webhook on completion/failure.
    """
    threading.Thread(
        target=_run_summarize_in_thread,
        args=(material_id,),
        daemon=True,
        name=f"summarize_{material_id}",
    ).start()


def start_scheduler() -> None:
    """Start the background scheduler (idempotent).

    A one-time job runs _run_summarize immediately to recover any stranded
    batch tasks from previous server sessions.  After that the scheduler
    remains idle — summarization itself is triggered by user action.
    """
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        _run_summarize, "date",
        run_date=datetime.now(timezone.utc),
        id="library_summarize_recover",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Summarization scheduler started (startup recovery scheduled)")


def stop_scheduler() -> None:
    """Stop the scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
    _active_materials.clear()
