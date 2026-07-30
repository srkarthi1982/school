"""Secure handling for 7-Zip-compatible Aircraft Viewer SFX packages."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from uuid import uuid4

from fastapi import HTTPException, status

from app.core.config import settings

CONTENT_KIND = "aircraft_viewer"
PACKAGE_ID_RE = re.compile(r"^[0-9a-f]{32}$")
PACKAGE_ROOT = (Path(__file__).resolve().parents[3] / "private_uploads" / "aircraft-viewers").resolve()


@dataclass(frozen=True)
class PreparedAircraftViewer:
    package_id: str
    final_directory: Path
    metadata: dict[str, str]


def resolve_seven_zip() -> str:
    configured = settings.SEVEN_ZIP_PATH.strip()
    if configured:
        configured_path = Path(configured)
        if configured_path.is_file():
            return str(configured_path.resolve())
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Configured SEVEN_ZIP_PATH does not point to a valid 7-Zip executable.",
        )
    candidates = [
        shutil.which("7z") or "",
        shutil.which("7zz") or "",
        str(Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "7-Zip" / "7z.exe"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="7-Zip is not configured. Set SEVEN_ZIP_PATH to the 7z executable.",
    )


def _run_7z(args: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            args,
            shell=False,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=settings.AIRCRAFT_VIEWER_EXTRACTION_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=422, detail="Aircraft Viewer archive processing timed out") from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "7-Zip rejected the archive").strip()
        if "password" in detail.lower() or "encrypted" in detail.lower():
            detail = "Password-protected Aircraft Viewer packages are not supported"
        raise HTTPException(status_code=422, detail=detail[:500])
    return result


def _parse_slt(output: str) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    current: dict[str, str] = {}
    in_entries = False
    for raw in output.splitlines():
        line = raw.strip()
        if line.startswith("----------"):
            in_entries = True
            current = {}
            continue
        if not in_entries:
            continue
        if not line:
            if current:
                records.append(current)
                current = {}
            continue
        if " = " in line:
            key, value = line.split(" = ", 1)
            current[key] = value
    if current:
        records.append(current)
    return records


def _safe_archive_path(raw_path: str) -> PurePosixPath:
    normalized = raw_path.replace("\\", "/")
    path = PurePosixPath(normalized)
    if (
        not normalized
        or normalized.startswith(("/", "//"))
        or re.match(r"^[A-Za-z]:", normalized)
        or any(part in ("", ".", "..") for part in path.parts)
    ):
        raise HTTPException(status_code=422, detail=f"Unsafe archive path: {raw_path}")
    return path


def inspect_archive(seven_zip: str, archive: Path) -> list[PurePosixPath]:
    result = _run_7z([seven_zip, "l", "-slt", "-sccUTF-8", str(archive)])
    records = _parse_slt(result.stdout)
    if not records:
        raise HTTPException(status_code=422, detail="The file is not a supported 7-Zip archive")

    paths: list[PurePosixPath] = []
    seen: set[str] = set()
    total_size = 0
    file_count = 0
    for record in records:
        raw_path = record.get("Path")
        if not raw_path:
            continue
        if record.get("Encrypted", "-") == "+":
            raise HTTPException(status_code=422, detail="Password-protected Aircraft Viewer packages are not supported")
        attributes = record.get("Attributes", "")
        if "L" in attributes or record.get("Symbolic Link"):
            raise HTTPException(status_code=422, detail="Links are not allowed in Aircraft Viewer packages")
        path = _safe_archive_path(raw_path)
        folded = str(path).casefold()
        if folded in seen:
            raise HTTPException(status_code=422, detail=f"Duplicate archive path: {raw_path}")
        seen.add(folded)
        paths.append(path)
        if not attributes.startswith("D"):
            file_count += 1
            try:
                total_size += int(record.get("Size", "0"))
            except ValueError as exc:
                raise HTTPException(status_code=422, detail="Archive contains an invalid file size") from exc

    if file_count > settings.AIRCRAFT_VIEWER_EXTRACTED_MAX_FILES:
        raise HTTPException(status_code=422, detail="Aircraft Viewer package contains too many files")
    if total_size > settings.AIRCRAFT_VIEWER_EXTRACTED_MAX_BYTES:
        raise HTTPException(status_code=422, detail="Aircraft Viewer package is too large after extraction")
    return paths


def _validate_extracted_tree(root: Path) -> list[Path]:
    resolved_root = root.resolve()
    files: list[Path] = []
    total_size = 0
    for path in root.rglob("*"):
        resolved = path.resolve()
        try:
            resolved.relative_to(resolved_root)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Extracted package escapes its destination") from exc
        if path.is_symlink() or (getattr(path.stat(), "st_file_attributes", 0) & 0x400):
            raise HTTPException(status_code=422, detail="Links or reparse points are not allowed")
        if path.is_file():
            files.append(path)
            total_size += path.stat().st_size
    if len(files) > settings.AIRCRAFT_VIEWER_EXTRACTED_MAX_FILES:
        raise HTTPException(status_code=422, detail="Extracted package contains too many files")
    if total_size > settings.AIRCRAFT_VIEWER_EXTRACTED_MAX_BYTES:
        raise HTTPException(status_code=422, detail="Extracted package is too large")
    return files


def _viewer_root(extract_root: Path, files: list[Path]) -> tuple[Path, Path]:
    for preferred_name in ("index.htm", "index.html"):
        matching_indexes = [
            path for path in files
            if path.name.casefold() == preferred_name
        ]
        if len(matching_indexes) == 1:
            entrypoint = matching_indexes[0]
            return entrypoint.parent, entrypoint
        if len(matching_indexes) > 1:
            raise HTTPException(
                status_code=422,
                detail=f"The selected EXE contains multiple {preferred_name} files.",
            )
    raise HTTPException(
        status_code=422,
        detail="The selected EXE is not a valid Aircraft Viewer package or does not contain index.htm or index.html.",
    )


def prepare_package(file_bytes: bytes, source_filename: str) -> PreparedAircraftViewer:
    extension = Path(source_filename).suffix.casefold()
    if extension != ".exe":
        raise HTTPException(status_code=415, detail="Aircraft Viewer package must be an .exe file")
    if not file_bytes:
        raise HTTPException(status_code=422, detail="Aircraft Viewer package is empty")
    if len(file_bytes) > settings.AIRCRAFT_VIEWER_PACKAGE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Aircraft Viewer package exceeds the configured upload limit")

    seven_zip = resolve_seven_zip()
    package_id = uuid4().hex
    PACKAGE_ROOT.mkdir(parents=True, exist_ok=True)
    final_directory = (PACKAGE_ROOT / package_id).resolve()
    with tempfile.TemporaryDirectory(prefix="aircraft-viewer-") as temp_name:
        temp_root = Path(temp_name)
        archive = temp_root / "package.exe"
        archive.write_bytes(file_bytes)
        inspect_archive(seven_zip, archive)
        extracted = temp_root / "extracted"
        extracted.mkdir()
        _run_7z([seven_zip, "x", str(archive), f"-o{extracted}", "-y", "-bd"])
        files = _validate_extracted_tree(extracted)
        viewer_root, source_entrypoint = _viewer_root(extracted, files)
        entrypoint = source_entrypoint.relative_to(viewer_root).as_posix()
        try:
            shutil.move(str(viewer_root), str(final_directory))
        except Exception:
            shutil.rmtree(final_directory, ignore_errors=True)
            raise

    metadata = {
        "content_kind": CONTENT_KIND,
        "viewer_package_id": package_id,
        "viewer_entrypoint": entrypoint,
        "viewer_relative_root": f"aircraft-viewers/{package_id}",
        "source_filename": source_filename,
    }
    return PreparedAircraftViewer(package_id, final_directory, metadata)


def parse_aircraft_viewer_metadata(value: str | None) -> dict[str, str] | None:
    try:
        metadata = json.loads(value or "{}")
    except (TypeError, ValueError):
        return None
    if metadata.get("content_kind") != CONTENT_KIND:
        return None
    package_id = metadata.get("viewer_package_id")
    entrypoint = metadata.get("viewer_entrypoint")
    if not isinstance(package_id, str) or not PACKAGE_ID_RE.fullmatch(package_id):
        return None
    if not isinstance(entrypoint, str):
        return None
    try:
        safe_entrypoint = _safe_archive_path(entrypoint)
    except HTTPException:
        return None
    if safe_entrypoint.suffix.casefold() not in {".html", ".htm"}:
        return None
    return metadata


def safe_package_directory(package_id: str) -> Path:
    if not PACKAGE_ID_RE.fullmatch(package_id):
        raise ValueError("Invalid Aircraft Viewer package ID")
    path = (PACKAGE_ROOT / package_id).resolve()
    path.relative_to(PACKAGE_ROOT)
    return path


def delete_package(package_id: str) -> None:
    path = safe_package_directory(package_id)
    if path.is_dir():
        shutil.rmtree(path)
