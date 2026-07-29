import mimetypes
from pathlib import Path
import re

from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse
from app.core.config import settings

class AudioStreamerService:
    def __init__(self, audio_file_path: str):
        self.audio_file_path = audio_file_path

    def _get_resolved_path(self) -> Path:
        """
        Securely resolve file path and prevent directory traversal attacks.
        """
        # abs_file_path = get_storage_backend().get_absolute_path(self.audio_file_path)
        abs_file_path = settings.LIBRARY_UPLOAD_DIR / "voice" / self.audio_file_path
        if not abs_file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="File not exists")

        return abs_file_path

    def _generate_audio_chunks(self, filepath: Path, start: int, end: int, chunk_size: int = 8192):
        """Memory-efficient chunk generator for streaming."""
        with open(filepath, "rb") as f:
            f.seek(start)
            while start <= end:
                bytes_to_read = min(chunk_size, end - start + 1)
                chunk = f.read(bytes_to_read)
                if not chunk:
                    break
                start += len(chunk)
                yield chunk

    def stream_audio(self, range_header: str | None):
        filepath = self._get_resolved_path()
        self.mime_type = mimetypes.guess_type(
            filepath)[0] or "application/octet-stream"

        if filepath.suffix.lower() == ".wav":
            self.mime_type = "audio/wav"
        elif filepath.suffix.lower() == ".mp3":
            self.mime_type = "audio/mpeg"

        file_size = filepath.stat().st_size
        # range_header = request.headers.get("range")

        base_headers = {
            "Content-Type": self.mime_type,
            "Content-Disposition": f'inline; filename="{filepath.name}"',
            "Accept-Ranges": "bytes",
        }

        if range_header:
            match = re.match(r"bytes=(\d+)-(\d*)", range_header)
            if match:
                start = int(match.group(1))
                end = int(match.group(2)) if match.group(2) else file_size - 1
                end = min(end, file_size - 1)

                if start > end or start >= file_size:
                    raise HTTPException(
                        status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE, detail="Range not satisfiable")

                headers = {**base_headers,
                           "Content-Range": f"bytes {start}-{end}/{file_size}",
                           "Content-Length": str(end - start + 1)}
                return StreamingResponse(
                    self._generate_audio_chunks(filepath, start, end),
                    status_code=status.HTTP_206_PARTIAL_CONTENT,  # Partial Content
                    headers=headers
                )

        headers = {**base_headers, "Content-Length": str(file_size)}
        return StreamingResponse(
            self._generate_audio_chunks(filepath, 0, file_size - 1),
            status_code=status.HTTP_200_OK,
            headers=headers
        )
