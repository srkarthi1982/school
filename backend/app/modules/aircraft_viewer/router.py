import mimetypes
from collections.abc import Sequence
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from starlette.responses import FileResponse

from app.core.config import settings
from app.modules.aircraft_viewer.constants import (
    AIRCRAFT_VIEWER_DIRECTORY,
    AIRCRAFT_VIEWER_INDEX_FILE,
    AIRCRAFT_VIEWER_ROUTE_PREFIX,
)

router = APIRouter(prefix=AIRCRAFT_VIEWER_ROUTE_PREFIX, tags=["Internal Aircraft Viewer"])

def _csp_origin(origin: str) -> str:
    normalized = origin.rstrip("/")
    if normalized == "*":
        raise ValueError("Aircraft viewer frame origins must be explicit.")
    return normalized


def _frame_ancestors(allowed_frame_origins: Sequence[str]) -> str:
    return " ".join(
        dict.fromkeys(
            ["'self'", *(_csp_origin(origin) for origin in allowed_frame_origins)]
        )
    )

mimetypes.add_type("model/gltf-binary", ".glb")
mimetypes.add_type("model/gltf+json", ".gltf")
mimetypes.add_type("application/wasm", ".wasm")


def _viewer_file_response(file_path: Path) -> FileResponse:
    return FileResponse(
        file_path,
        headers={
            "Content-Security-Policy": (
                f"frame-ancestors {_frame_ancestors(settings.CORS_ORIGINS)}"
            ),
        },
    )


@router.get("/", response_class=FileResponse, summary="Open the temporary aircraft viewer")
def aircraft_viewer_index(
    name: Literal["aircraft_viewer"] = Query(
        ...,
        description="Registered static viewer package name.",
    ),
) -> FileResponse:
    return _viewer_file_response(AIRCRAFT_VIEWER_INDEX_FILE)


@router.get(
    "/{asset_path:path}",
    response_class=FileResponse,
    include_in_schema=False,
)
def aircraft_viewer_asset(asset_path: str) -> FileResponse:
    viewer_root = AIRCRAFT_VIEWER_DIRECTORY.resolve()
    requested_file = (viewer_root / asset_path).resolve()

    try:
        requested_file.relative_to(viewer_root)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Viewer asset not found") from exc

    if not requested_file.is_file():
        raise HTTPException(status_code=404, detail="Viewer asset not found")

    return _viewer_file_response(requested_file)
