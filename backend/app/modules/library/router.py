import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile, File, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse as FastAPIFileResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from anyio import to_thread

from app.core.config import settings
from app.core.database import get_db, SessionLocal
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.modules.file_sharing.services import save_uploaded_file
from .common import manager
from .common.services import _extract_websocket_token
# from app.modules.file_sharing.storage import get_storage_backend
from app.modules.library.audio_streamer import AudioStreamerService
from .models import LibraryMaterial, LibraryMaterialUserProgress, MaterialSummary
from .schemas import (
    LibraryMaterialCreate,
    LibraryMaterialRead,
    MaterialSummaryMindmapRead,
    MaterialSummaryRead,
    MaterialSummaryVoiceNarrationRead,
    LibraryMaterialUpdate,
    LibraryMaterialUserProgressRead,
    LibraryMaterialUserProgressUpdate,
    SummaryWebhookTask,
)
from .services import _get_storage_backend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/library", tags=["Library"])

# Permission code strings (these match what `current_user` carries on its roles).
PERM_READ = PermissionCode.LIBRARY_READ.value
PERM_WRITE = PermissionCode.LIBRARY_WRITE.value
PERM_MANAGE = PermissionCode.LIBRARY_MANAGE.value

VALID_MATERIAL_TYPES = {"general", "course", "personal"}


# ---------------------------------------------------------------------------
# Permission / visibility helpers
# ---------------------------------------------------------------------------

def _user_perms(user) -> set[str]:
    """The set of permission codes the user holds via their roles."""
    return {p.code for r in user.roles for p in r.permissions}


def _can_upload(material_type: str, perms: set[str]) -> bool:
    """Who may upload into a given material space (mirrors the frontend gate)."""
    if material_type == "general":
        return PERM_MANAGE in perms
    if material_type == "course":
        return PERM_WRITE in perms
    if material_type == "personal":
        return PERM_READ in perms
    return False


def _is_owner(material: LibraryMaterial, full_name: str | None) -> bool:
    return bool(material.uploaded_by) and material.uploaded_by == full_name


def _can_view(material: LibraryMaterial, full_name: str | None, perms: set[str]) -> bool:
    """
    Whether `current_user` may see / download `material`.

    Managers see everything; you always see your own uploads. Personal files are
    owner-only. Course/General files are visible once approved.

    NOTE: per-course membership (which student is enrolled in which course) is
    applied on the frontend, which knows the user's accessible courses. The
    backend returns the approved superset, which is a strict tightening over the
    previous behaviour (no filtering at all).
    """
    # if material.material_type == "course" and material.approved_status != "approved":
    #     return False
    if PERM_MANAGE in perms:
        return True
    if _is_owner(material, full_name):
        return True
    if material.material_type == "personal":
        return False
    return material.approved_status == "approved"


def _get_material_or_404(db: Session, material_id: int) -> LibraryMaterial:
    material = db.execute(
        select(LibraryMaterial).where(LibraryMaterial.id == material_id)
    ).scalar_one_or_none()
    if material is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    return material


def _to_read(material: LibraryMaterial, summary_ts: datetime | None = None) -> LibraryMaterialRead:
    obj = LibraryMaterialRead.model_validate(material)
    obj.summary_ts = summary_ts
    return obj


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=LibraryMaterialRead)
async def upload_material(
    file: UploadFile = File(...),
    title: str = Form(...),
    description: str = Form(""),
    category: str = Form(...),
    material_type: str = Form(...),
    version: str = Form("1"),
    folder: str = Form(""),
    # accepted for backwards-compat but ignored (see below)
    uploaded_by: str = Form(""),
    totalPages: str = Form("1"),
    # pagesRead: str = Form("0"),
    # coverimage: bytes | None = Form(None),
    metadata_json: str = Form(""),
    approved_status: str = Form("approved"),  # ditto — the server decides
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.LIBRARY_READ)),
):
    if material_type not in VALID_MATERIAL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid material_type")

    perms = _user_perms(current_user)
    if not _can_upload(material_type, perms):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You are not allowed to upload {material_type} materials",
        )

    # Trust the server, not the client, for who uploaded and the approval state.
    owner = current_user.full_name or current_user.username
    # Course uploads by non-managers need approval; everything else is auto-approved.
    effective_status = "pending" if (
        material_type == "course" and PERM_MANAGE not in perms) else "approved"

    try:
        file_bytes = await file.read()
        # save_uploaded_file validates the content type/size and returns
        # (storage_key, thumbnail_key). The storage_key doubles as our file_url.
        storage_key, _thumbnail_key = save_uploaded_file(
            file_bytes,
            file.filename or "unnamed",
            file.content_type or "application/octet-stream",
        )

        try:
            metadata = json.loads(metadata_json) if metadata_json else {}
        except ValueError:
            metadata = {}
        # metadata["folder"] = folder
        metadata["uploaded_by"] = owner
        # metadata["approved_status"] = effective_status

        material_in = LibraryMaterialCreate(
            file_id=Path(storage_key).stem,
            file_url=storage_key,
            file_name=file.filename,
            content_type=file.content_type or "",
            file_size=len(file_bytes),
            title=title,
            description=description,
            category=category,
            material_type=material_type,
            version=version,
            upload_date=datetime.now(),
            folder=folder,
            uploaded_by=owner,
            approved_status=effective_status,
            metadata_json=json.dumps(metadata),
            totalPages=totalPages,
            # pagesRead= pagesRead,
            # coverimage=coverimage,
        )
        result = _create_library_material(db, material_in)
        # -----------------------------------------------------------------------
        # Create an initial user‑progress record for the uploader.
        # This ensures a row exists in `library_material_user_progress` with
        # `pages_read` set to 0, replacing the previous client‑side handling.
        # -----------------------------------------------------------------------
        progress = LibraryMaterialUserProgress(
            user_id=current_user.id,
            material_id=result.id,
            pages_read=0,
        )
        db.add(progress)
        db.commit()
        db.refresh(progress)
        logger.info("Library material uploaded: id=%s by=%s", result.id, owner)
        return result
    except HTTPException:
        # Validation errors (415/413/…) from save_uploaded_file must reach the client unchanged.
        raise
    except Exception as exc:
        logger.error("Library upload failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Upload failed")


@router.get("/", response_model=list[LibraryMaterialRead])
def get_materials(
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.LIBRARY_READ)),
):
    perms = _user_perms(current_user)
    full_name = current_user.full_name
    results = db.execute(
        select(
            LibraryMaterial,
            MaterialSummary.summarize_ts.label("summary_ts"),
        )
        .outerjoin(MaterialSummary, LibraryMaterial.summary)
    ).unique().all()
    return [
        _to_read(material, ts)
        for material, ts in results
        if _can_view(material, full_name, perms)
    ]


@router.get(
    "/user/{user_id}/materials",
    response_model=list[dict],
    name="Get all library materials with user progress",
)
def get_materials_with_user_progress(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.LIBRARY_READ)),
):
    """
    Return a list of all library materials visible to the current user,
    each augmented with the `pages_read` value for the specified `user_id`.
    If a progress record does not exist for a material, `pages_read` defaults to 0.
    """
    # Permissions and visibility check (same as get_materials)
    perms = _user_perms(current_user)
    full_name = current_user.full_name
    # Fetch all materials the user is allowed to see
    materials = db.execute(select(LibraryMaterial)).scalars().all()
    visible_materials = [
        m for m in materials if _can_view(m, full_name, perms)]

    # Fetch all progress records for the given user in a single query
    progress_records = (
        db.execute(
            select(LibraryMaterialUserProgress).where(
                LibraryMaterialUserProgress.user_id == user_id
            )
        )
        .scalars()
        .all()
    )
    # Map material_id -> pages_read
    progress_map = {p.material_id: p.pages_read for p in progress_records}

    # Build result list combining material data with pages_read
    result = []
    for material in visible_materials:
        pages_read = progress_map.get(material.id, 0)
        # Convert material to dict using its Pydantic schema and add pages_read
        material_dict = LibraryMaterialRead.from_orm(material).model_dump()
        material_dict["pages_read"] = pages_read
        result.append(material_dict)

    return result


@router.get("/type/{material_type}", response_model=list[LibraryMaterialRead])
def get_materials_by_type(
    material_type: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.LIBRARY_READ)),
):
    perms = _user_perms(current_user)
    full_name = current_user.full_name
    results = db.execute(
        select(
            LibraryMaterial,
            MaterialSummary.summarize_ts.label("summary_ts"),
        )
        .outerjoin(MaterialSummary, LibraryMaterial.summary)
        .where(LibraryMaterial.material_type == material_type)
        .order_by(LibraryMaterial.upload_date.desc())
    ).unique().all()
    return [
        _to_read(material, ts)
        for material, ts in results
        if _can_view(material, full_name, perms)
    ]


@router.get("/{material_id}", response_model=LibraryMaterialRead)
def get_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.LIBRARY_READ)),
):
    material = _get_material_or_404(db, material_id)
    if not _can_view(material, current_user.full_name, _user_perms(current_user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="You do not have access to this material")
    result = db.execute(
        select(
            LibraryMaterial,
            MaterialSummary.summarize_ts.label("summary_ts"),
        )
        .outerjoin(MaterialSummary, LibraryMaterial.summary)
        .where(LibraryMaterial.id == material_id)
    ).one_or_none()
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    material, ts = result
    return _to_read(material, ts)


@router.put("/{material_id}", response_model=LibraryMaterialRead)
def update_material(
    material_id: int,
    update_in: LibraryMaterialUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.LIBRARY_READ)),
):
    material = _get_material_or_404(db, material_id)
    perms = _user_perms(current_user)

    # Approve/reject is a manager-only action.
    if update_in.approved_status is not None and PERM_MANAGE not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers can change the approval status",
        )

    # Moving a file between folders is allowed for the owner or a manager.
    if update_in.folder is not None and PERM_MANAGE not in perms and not _is_owner(material, current_user.full_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only move files you uploaded",
        )

    _update_library_material(
        db,
        material,
        update_in.folder,
        update_in.approved_status,
        update_in.totalPages,
        # update_in.pagesRead,
        # update_in.coverimage,
    )
    db.refresh(material)
    result = db.execute(
        select(
            LibraryMaterial,
            MaterialSummary.summarize_ts.label("summary_ts"),
        )
        .outerjoin(MaterialSummary, LibraryMaterial.summary)
        .where(LibraryMaterial.id == material_id)
    ).one_or_none()
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    updated, ts = result
    return _to_read(updated, ts)


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.LIBRARY_READ)),
):
    material = _get_material_or_404(db, material_id)
    perms = _user_perms(current_user)
    if PERM_MANAGE not in perms and not _is_owner(material, current_user.full_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete files you uploaded",
        )

    # Best-effort removal of the physical file; the DB row is the source of truth.
    if material.file_url:
        try:
            # get_storage_backend().delete(material.file_url)
            _get_storage_backend(material_type=material.material_type).delete(
                material.file_url)
        except Exception:
            logger.exception(
                "Failed to delete physical file for material %s", material_id)

    db.delete(material)
    db.commit()
    return None

# ---------------------------------------------------------------------------
# Library Material User Progress Endpoints
# ---------------------------------------------------------------------------


def _get_or_create_user_progress(db: Session, user_id: int, material_id: int):
    progress = db.execute(
        select(LibraryMaterialUserProgress).where(
            LibraryMaterialUserProgress.material_id == material_id,
            LibraryMaterialUserProgress.user_id == user_id,
        )
    ).scalar_one_or_none()
    if progress is None:
        progress = LibraryMaterialUserProgress(
            user_id=user_id,
            material_id=material_id,
            pages_read=0,
        )
        db.add(progress)
        db.commit()
        db.refresh(progress)
    return progress


@router.get(
    "/progress/{material_id}/{user_id}",
    response_model=LibraryMaterialUserProgressRead,
)
def get_material_user_progress(
    material_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.LIBRARY_READ)),
):
    # Ensure the requesting user has permission to view the material
    material = _get_material_or_404(db, material_id)
    if not _can_view(material, current_user.full_name, _user_perms(current_user)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this material",
        )
    return _get_or_create_user_progress(db, user_id, material_id)


@router.put(
    "/progress/{material_id}/{user_id}",
    response_model=LibraryMaterialUserProgressRead,
)
def update_material_user_progress(
    material_id: int,
    user_id: int,
    update_in: LibraryMaterialUserProgressUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.LIBRARY_WRITE)),
):
    # Verify permission to modify progress (owner or manager)
    material = _get_material_or_404(db, material_id)
    if not _can_view(material, current_user.full_name, _user_perms(current_user)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to modify this material",
        )
    # progress = db.execute(
    #     select(LibraryMaterialUserProgress).where(
    #         LibraryMaterialUserProgress.material_id == material_id,
    #         LibraryMaterialUserProgress.user_id == user_id,
    #     )
    # ).scalar_one_or_none()
    # if progress is None:
    #     raise HTTPException(
    #         status_code=status.HTTP_404_NOT_FOUND,
    #         detail="Progress record not found",
    #     )
    progress = _get_or_create_user_progress(
        db, user_id=user_id, material_id=material_id)
    if update_in.pages_read is not None:
        progress.pages_read = update_in.pages_read
    db.add(progress)
    db.commit()
    db.refresh(progress)
    return progress


@router.get("/download/{material_id}")
def download_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.LIBRARY_READ)),
):
    material = _get_material_or_404(db, material_id)

    if not _can_view(material, current_user.full_name, _user_perms(current_user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="You do not have access to this material")
    if not material.file_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File URL not found")

    # abs_path = get_storage_backend().get_absolute_path(material.file_url)
    abs_path = _get_storage_backend(
        material_type=material.material_type).get_absolute_path(material.file_url)
    if not abs_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="File not found on disk")

    file_name = material.file_name or f"material-{material_id}"
    return FastAPIFileResponse(
        path=str(abs_path),
        filename=file_name,
        media_type=material.content_type or "application/octet-stream",

        # Putting filename in headers break when filename is in arabic
        # headers={"Content-Disposition": f'inline; filename="{file_name}"'},
    )


@router.get("/summary/{material_id}", response_model=SuccessResponse[MaterialSummaryRead])
def get_summary(material_id: int, db: Session = Depends(get_db), _=Depends(require_permission(PermissionCode.LIBRARY_READ))):
    stmt = select(
        MaterialSummary.id,
        MaterialSummary.version,
        func.coalesce(
            MaterialSummary.summary["overall_summary"].as_string(),
            text("NULL"),
        ).label("overall_summary"),
        # MaterialSummary.summary["section_summary"].as_string().label(
        #     "section_summary"),
        MaterialSummary.summary["sections"].as_json().label(
            "sections"),
        MaterialSummary.summary["abbreviations"].as_json().label(
            "abbreviations"),
    ).where(MaterialSummary.id == material_id)

    summary = db.execute(stmt).mappings().first()
    if not summary:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return ok(summary)


@router.get("/summary/narration/{material_id}", response_model=SuccessResponse[MaterialSummaryVoiceNarrationRead])
def get_summary_voice_narration(material_id: int, db: Session = Depends(get_db), _=Depends(require_permission(PermissionCode.LIBRARY_READ))):
    stmt = select(
        MaterialSummary.id,
        MaterialSummary.version,
        MaterialSummary.narrative_text.as_json().label("narration_text")
    ).where(MaterialSummary.id == material_id)

    result = db.execute(stmt).mappings().first()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return ok(result)


@router.get("/summary/voice/{material_id}")
def stream_voice_narration(material_id: int,
                           request: Request,
                           db: Session = Depends(get_db),
                           #    _=Depends(require_permission(PermissionCode.LIBRARY_READ))
                           ):
    audio_file_path = db.execute(select(MaterialSummary.narrative_voice).where(
        MaterialSummary.id == material_id)).scalar_one_or_none()
    if not audio_file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found")

    service = AudioStreamerService(audio_file_path)
    return service.stream_audio(request.headers.get("range"))


@router.get("/summary/mindmap/{material_id}", response_model=SuccessResponse[MaterialSummaryMindmapRead])
def get_summary_mindmap(material_id: int, db: Session = Depends(get_db), _=Depends(require_permission(PermissionCode.LIBRARY_READ))):
    stmt = select(
        MaterialSummary.id,
        MaterialSummary.version,
        func.coalesce(
            MaterialSummary.mindmap["root_label"].as_string(),
            text("NULL"),
        ).label("root_label"),
        func.coalesce(
            MaterialSummary.mindmap["markdown"].as_string(),
            text("NULL"),
        ).label("markdown"),
        MaterialSummary.mindmap["merged_tree"].as_json().label(
            "merged_tree")
    ).where(MaterialSummary.id == material_id)

    result = db.execute(stmt).mappings().first()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return ok(result)


@router.post("/summarize/{material_id}")
def trigger_summarize(
    material_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PermissionCode.LIBRARY_WRITE)),
):
    """
    Create a MaterialSummary row and submit for summarization.
    Returns immediately; the result arrives via webhook on completion/failure.
    """
    from .services import get_or_create_summary_by_type
    from .scheduler import trigger_summarize

    material = _get_material_or_404(db, material_id)
    get_or_create_summary_by_type(db, material.material_type, material_id)
    trigger_summarize(material_id)
    return _get_material_or_404(db, material_id)


# ---------------------------------------------------------------------------
# Retry timed-out summaries endpoint
# ---------------------------------------------------------------------------

@router.post("/summary/retry-timeouts", response_model=SuccessResponse[dict])
def retry_timed_out_summaries(
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.LIBRARY_WRITE)),
):
    """
    Find material summaries that timed out, re-poll the summarizer task
    for each, and apply the latest status.

    Returns: { total_found, retried, reset, completed, failed }
    """
    from .summarizer_client import SummarizerClient
    from .services import _process_batch_result

    timeout_filter = MaterialSummary.error_message.like("%timed out%")
    completed_filter = MaterialSummary.summarize_ts.isnot(None)

    summaries = db.execute(
        select(MaterialSummary).where(
            timeout_filter, completed_filter
        )
    ).scalars().all()
    
    retried = 0
    reset = 0
    completed = 0
    failed = 0

    client = SummarizerClient(api_key=settings.DOC_SUMMARY_API_KEY or None)

    for summary in summaries:
        task_id = summary.task_id
        if not task_id:
            continue

        retried += 1
        status_data = client.get_batch_task_status(task_id)

        if status_data is None:
            continue

        status = status_data.get("status", "")

        if status == "failed":
            msg = status_data.get("error_msg") or "Batch task failed"
            summary.error_message = msg
            summary.summarize_ts = datetime.now(timezone.utc)
            db.commit()
            failed += 1

        elif status in ("pending", "processing"):
            summary.error_message = None
            summary.summarize_ts = None
            db.commit()
            reset += 1

        elif status == "completed":
            result = status_data.get("result") or {}
            _process_batch_result(db, summary, result, settings.DOC_SUMMARY_API_KEY or None)
            summary.error_message = None
            summary.summarize_ts = datetime.now(timezone.utc)
            db.commit()
            completed += 1

    return ok({
        "total_found": len(summaries),
        "retried": retried,
        "reset": reset,
        "completed": completed,
        "failed": failed,
    })


# ---------------------------------------------------------------------------
# Status endpoint
# ---------------------------------------------------------------------------

@router.get("/summary/status/{material_id}", response_model=SuccessResponse[dict])
def summarize_status(
    material_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.LIBRARY_READ)),
):
    """
    Return summarization status including whether a full attempt was ever made.
    summarize_ts is NULL before any attempt; set to a timestamp after all 3 steps.
    """
    summary = db.query(MaterialSummary).filter(
        MaterialSummary.id == material_id
    ).first()

    if summary is None:
        return ok({"summarize_ts": None, "summarizing": False, "status": "N/A"})

    status = None
    if summary.summarize_ts:
        status = "Summary Available" if (
            summary.summary or summary.mindmap or summary.narrative_text) else "Summary Not Available"

    return ok({
        "summarize_ts": summary.summarize_ts.isoformat() if summary.summarize_ts else None,
        "summarizing": summary.summarize_ts is None,
        "status": status,
        "error_message": summary.error_message
    })

@router.post("/summary/callback")
def summarizer_webhook(task: SummaryWebhookTask, db: Session = Depends(get_db)):
    """Receive webhook from summarizer service on batch completion/failure."""
    from .services import _process_batch_result

    if task.task_id is None:
        raise HTTPException(status_code=400, detail="Missing task_id in webhook")

    summary = db.query(MaterialSummary).filter(
        MaterialSummary.task_id == task.task_id
    ).first()

    if summary is None:
        logger.warning("Webhook received for unknown task_id=%s", task.task_id)
        raise HTTPException(status_code=404, detail=f"task_id={task.task_id} not found")

    # Idempotent: if already resolved, silently acknowledge
    if summary.summarize_ts is not None:
        logger.debug("Webhook already processed for task_id=%s", task.task_id)
        return {"status": "already_processed"}

    if task.status == "completed":
        result = task.result or {}
        _process_batch_result(
            db, summary, result, settings.DOC_SUMMARY_API_KEY or None)
        summary.summarize_ts = datetime.now(timezone.utc)
        summary.error_message = None
        db.commit()
        logger.info("Webhook completed batch %s for material %s", task.task_id, summary.id)

    elif task.status == "failed":
        summary.error_message = task.error_msg or "Batch task failed"
        summary.summarize_ts = datetime.now(timezone.utc)
        db.commit()
        logger.warning("Webhook: batch %s failed for material %s: %s", task.task_id, summary.id, summary.error_message)

    else:
        logger.debug("Webhook: task %s status=%s — still processing", task.task_id, task.status)
        return {"status": "still_processing"}

    manager.push_status_sync(summary.id)
    return {"status": "processed"}

# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------


def _create_library_material(db: Session, material_in: LibraryMaterialCreate) -> LibraryMaterial:
    try:
        db_obj = LibraryMaterial(**material_in.model_dump())
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception:
        db.rollback()
        raise


def _update_library_material(
    db: Session,
    material: LibraryMaterial,
    folder: str | None = None,
    approved_status: str | None = None,
    total_pages: int | None = None,
    pages_read: int | None = None,
    coverimage: bytes | None = None,
) -> LibraryMaterial:
    try:
        try:
            metadata = json.loads(material.metadata_json or "{}")
        except ValueError:
            metadata = {}

        if approved_status is not None:
            material.approved_status = approved_status
            metadata["approved_status"] = approved_status

        if folder is not None:
            material.folder = folder
            metadata["folder"] = folder

        if total_pages is not None:
            metadata["totalPages"] = total_pages

        # if pages_read is not None:
            # Always update pagesRead to reflect the latest progress,
            # regardless of whether it is greater than the previous value.
        #     material.pagesRead = pages_read
        #     metadata["pagesRead"] = pages_read

        # if coverimage is not None:
        #     material.coverimage = coverimage

        material.metadata_json = json.dumps(metadata)

        db.add(material)
        db.commit()
        db.refresh(material)
        return material
    except Exception:
        db.rollback()
        raise


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------


@router.websocket("/ws")
async def library_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    token = _extract_websocket_token(websocket)
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing token")
        return

    await websocket.send_json({"type": "connection.ready"})

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")

            if event_type == "subscribe":
                material_id = data.get("material_id")
                if material_id:
                    manager.connect(material_id, websocket)
                    await websocket.send_json({
                        "type": "subscribed",
                        "material_id": material_id,
                    })
                continue

            await websocket.send_json({
                "type": "error",
                "message": f"Unsupported event: {event_type}",
            })
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        logger.exception("library ws: unexpected error")
        manager.disconnect(websocket)

