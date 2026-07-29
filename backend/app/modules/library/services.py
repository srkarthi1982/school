"""Background summarization orchestration for library materials."""
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.file_sharing.storage import (
    FileStorageBackend,
    FilesystemStorage,
    get_storage_backend,
)
from .models import LibraryMaterial, MaterialSummary
from .summarizer_client import SummarizerClient

logger = logging.getLogger(__name__)
AUDIO_DIR = settings.LIBRARY_UPLOAD_DIR / "voice"

_STORAGE_CACHE: dict[str, FileStorageBackend] = {}


def _get_storage_backend(material_type: str) -> FileStorageBackend:
    """Return the correct storage backend for a given material_type."""
    if material_type not in _STORAGE_CACHE:
        if material_type == "course":
            _STORAGE_CACHE[material_type] = FilesystemStorage(
                settings.MATERIAL_UPLOAD_DIR)
        elif material_type == "course_master":
            _STORAGE_CACHE[material_type] = FilesystemStorage(
                settings.MATERIAL_UPLOAD_DIR)
        else:
            _STORAGE_CACHE[material_type] = get_storage_backend()
    return _STORAGE_CACHE[material_type]


def _resolve_file_path(material: LibraryMaterial) -> Path:
    """Resolve LibraryMaterial.file_url to an absolute filesystem path."""
    if not material.file_url:
        raise FileNotFoundError(f"Material {material.id} has no file_url")
    backend = _get_storage_backend(material.material_type)
    abs_path = backend.get_absolute_path(material.file_url)
    if not abs_path.exists():
        raise FileNotFoundError(f"File not found on disk: {abs_path}")
    return abs_path


def get_or_create_summary(db: Session, material_id: int) -> MaterialSummary:
    """Get existing or create a new MaterialSummary for the material."""
    return get_or_create_summary_by_type(db, "library", material_id)


def get_or_create_summary_by_type(db: Session, material_type: str, material_id: int) -> MaterialSummary:
    """Get existing or create a new MaterialSummary for the material (polymorphic by type)."""
    summary = db.query(MaterialSummary).filter(
        MaterialSummary.material_type == material_type,
        MaterialSummary.id == material_id,
    ).first()
    if summary is None:
        summary = MaterialSummary(id=material_id, material_type=material_type)
        db.add(summary)
        db.commit()
        db.refresh(summary)
    return summary


def _process_batch_result(
    db: Session,
    summary: MaterialSummary,
    result: dict,
    summarizer_api_key: str | None,
) -> list[str]:
    """Extract the batch result and save to MaterialSummary fields.

    Returns a list of error strings for features that failed.
    """
    errors: list[str] = []

    # Summary (overall + sections + abbreviations)
    summary_data = result.get("summary")
    if summary_data:
        summary.summary = summary_data
        db.commit()
        logger.info("Saved summary for material %s", summary.id)

    # Mindmap
    mindmap_data = result.get("mindmap")
    if mindmap_data:
        summary.mindmap = mindmap_data
        db.commit()
        logger.info("Saved mindmap for material %s", summary.id)

    # Teleprompt / audio overview
    teleprompt = result.get("teleprompt") or {}
    teleprompt_text = teleprompt.get("teleprompt_text")
    if teleprompt_text:
        summary.narrative_text = teleprompt_text
        db.commit()
        logger.info("Saved teleprompt for material %s", summary.id)

    voice_file = teleprompt.get("voice_file_name")
    if voice_file:
        audio_client = SummarizerClient(api_key=summarizer_api_key)
        voice_path = audio_client.download_audio(voice_file, AUDIO_DIR)
        if voice_path:
            summary.narrative_voice = voice_path
            db.commit()
            logger.info("Saved voice file for material %s", summary.id)
        else:
            logger.warning("Failed to download voice for material %s", summary.id)
            errors.append("Failed to download voice file")

    # Collect any feature-level errors embedded in the batch result
    result_errors = result.get("errors") or []
    if result_errors:
        errors.append(f"Batch reported errors: {result_errors}")

    return errors


def summarize_material(db: Session, material_id: int) -> MaterialSummary:
    """
    Submit a batch summarisation task via /batch/from-file.

    The summarizer sends results back to /api/v1/library/summary/callback
    on completion/failure via webhook.  This function returns immediately
    after persisting the task_id.

    FileNotFoundError propagates so the row stays pending (summarize_ts IS NULL)
    and is retried by the crash-recovery hook at startup.
    """
    material = db.query(LibraryMaterial).filter(
        LibraryMaterial.id == material_id).first()
    if material is None:
        raise ValueError(f"Material {material_id} not found")

    file_path = _resolve_file_path(material)
    summary = get_or_create_summary_by_type(
        db, material.material_type, material_id)
    client = SummarizerClient(api_key=settings.DOC_SUMMARY_API_KEY or None)

    # Already done — short-circuit
    if summary.summarize_ts is not None:
        logger.info("Summary already completed for %s", material_id)
        return summary

    # Task ID — persist if new, otherwise the webhook callback will handle it
    task_id = summary.task_id
    if not task_id:
        task_id, error = client.submit_batch_task(file_path)
        if task_id is None:
            summary.error_message = error or "Failed to submit batch task to summarizer"
            summary.summarize_ts = datetime.now(timezone.utc)
            db.commit()
            return summary
        summary.task_id = task_id
        db.commit()
    logger.info(
        "Batch task %s submitted for material %s", task_id, material_id)
    return summary
