from __future__ import annotations
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Protocol
from uuid import uuid4

import filetype
from PIL import Image

from app.core.config import settings

# Ensure upload dir exists
settings.FILE_SHARING_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class FileStorageBackend(Protocol):
    """Protocol for pluggable file storage backends."""

    def save(self, file_bytes: bytes, filename: str, content_type: str) -> str:
        """Persist file bytes and return a storage key."""
        ...

    def read(self, storage_key: str) -> bytes:
        """Read file bytes by storage key."""
        ...

    def delete(self, storage_key: str) -> None:
        """Delete file by storage key."""
        ...

    def get_absolute_path(self, storage_key: str) -> Path:
        """Return absolute filesystem path for the storage key (if applicable)."""
        ...


class FilesystemStorage:
    """Stores files on a local or network-mounted filesystem."""

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _generate_thumbnail(self, image_path: Path, thumb_path: Path) -> None:
        with Image.open(image_path) as img:
            img.thumbnail((400, 400))
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(thumb_path, "JPEG", quality=85)

    def save(self, file_bytes: bytes, filename: str, content_type: str) -> tuple[str, str | None]:
        now = datetime.now(timezone.utc)
        rel_dir = Path(str(now.year)) / f"{now.month:02d}"
        dest_dir = self.base_dir / rel_dir
        dest_dir.mkdir(parents=True, exist_ok=True)

        file_id = uuid4()
        safe_name = Path(filename).name
        ext = Path(safe_name).suffix
        storage_path = dest_dir / f"{file_id}{ext}"
        storage_path.write_bytes(file_bytes)

        # Store relative key from base_dir, normalized to forward slashes for URL-friendliness
        storage_key = str(storage_path.relative_to(self.base_dir)).replace('\\', '/')

        thumbnail_key: str | None = None
        if content_type.startswith("image/") and content_type != "image/svg+xml":
            thumbnail_path = dest_dir / f"thumb_{file_id}.jpg"
            try:
                self._generate_thumbnail(storage_path, thumbnail_path)
                thumbnail_key = str(thumbnail_path.relative_to(self.base_dir))
            except Exception:
                thumbnail_key = None

        return storage_key, thumbnail_key

    def read(self, storage_key: str) -> bytes:
        path = self.base_dir / storage_key
        return path.read_bytes()

    def delete(self, storage_key: str) -> None:
        path = self.base_dir / storage_key
        if path.exists():
            path.unlink()

    def get_absolute_path(self, storage_key: str) -> Path:
        return self.base_dir / storage_key


def get_storage_backend() -> FileStorageBackend:
    backend = settings.FILE_SHARING_STORAGE_BACKEND.lower()
    if backend == "filesystem":
        return FilesystemStorage(settings.FILE_SHARING_UPLOAD_DIR)
    raise ValueError(f"Unsupported file sharing storage backend: {backend}")
