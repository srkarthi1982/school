import mimetypes
from collections.abc import Sequence
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Cookie, HTTPException, Query
from jose import JWTError, jwt
from starlette.responses import FileResponse

from app.core.config import settings
from app.modules.aircraft_viewer.constants import (
    AIRCRAFT_VIEWER_DIRECTORY,
    AIRCRAFT_VIEWER_INDEX_FILE,
    AIRCRAFT_VIEWER_ROUTE_PREFIX,
)
from app.modules.library.aircraft_viewer_packages import safe_package_directory

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


def _authorize_package(package_id: str, token: str | None) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Aircraft Viewer session is missing")
    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Aircraft Viewer session is invalid") from exc
    if claims.get("purpose") != "aircraft_viewer" or claims.get("package_id") != package_id:
        raise HTTPException(status_code=403, detail="Aircraft Viewer session does not match this package")
    return claims


@router.get(
    "/packages/{package_id}/",
    response_class=FileResponse,
    summary="Open an uploaded Aircraft Viewer package",
)
def aircraft_viewer_package_index(
    package_id: str,
    aircraft_viewer_session: str | None = Cookie(None),
) -> FileResponse:
    claims = _authorize_package(package_id, aircraft_viewer_session)
    try:
        root = safe_package_directory(package_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Viewer package not found") from exc
    entrypoint = claims.get("entrypoint")
    if not isinstance(entrypoint, str):
        raise HTTPException(status_code=401, detail="Aircraft Viewer session has no entry point")
    index = (root / entrypoint).resolve()
    try:
        index.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Viewer entry point not found") from exc
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Viewer entry point not found")
    return _viewer_file_response(index)


@router.get(
    "/packages/{package_id}/{asset_path:path}",
    response_class=FileResponse,
    include_in_schema=False,
)
def aircraft_viewer_package_asset(
    package_id: str,
    asset_path: str,
    aircraft_viewer_session: str | None = Cookie(None),
) -> FileResponse:
    _authorize_package(package_id, aircraft_viewer_session)
    try:
        root = safe_package_directory(package_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Viewer package not found") from exc
    requested_file = (root / asset_path).resolve()
    try:
        requested_file.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Viewer asset not found") from exc
    if not requested_file.is_file():
        raise HTTPException(status_code=404, detail="Viewer asset not found")
    return _viewer_file_response(requested_file)


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
