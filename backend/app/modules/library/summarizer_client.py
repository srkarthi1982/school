"""Client for the external document summarization service."""
import logging
from pathlib import Path

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)


class SummarizerClient:
    BASE_URL = settings.DOC_SUMMARY_BASE_URL.rstrip("/")
    WEBHOOK_BASE_URL = settings.DOC_SUMMARY_WEBHOOK_BASE_URL.rstrip("/")

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Accept": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def submit_batch_task(self, file_path: Path) -> tuple[str | None, str | None]:
        try:
            webhook_url = f"{self.WEBHOOK_BASE_URL}/api/v1/library/summary/callback"
            with open(file_path, "rb") as f:
                resp = requests.post(
                    f"{self.BASE_URL}/batch/from-file",
                    data={"webhook_url": webhook_url},
                    files={"file": (file_path.name, f, self._mime(file_path))},
                    headers=self._headers(),
                    timeout=120,
                )
            if resp.status_code != 200:
                try:
                    detail = resp.json().get("detail")
                except (ValueError, KeyError):
                    detail = f"Submit failed (HTTP {resp.status_code})"
                return None, detail or f"Submit failed (HTTP {resp.status_code})"
            resp.raise_for_status()
            body = resp.json()
            task_id = body.get("id") or body.get("task_id")
            if not task_id:
                logger.warning("batch/from-file returned no id: %s", body)
                return None, None
            logger.info("Submitted batch task %s for %s", task_id, file_path)
            return task_id, None
        except requests.HTTPError:            
            return None, resp.json()['detail']
        except Exception:
            logger.exception("Failed to submit batch task for %s", file_path)
            return None, None

    def get_batch_task_status(self, task_id: str) -> dict | None:
        try:
            resp = requests.get(
                f"{self.BASE_URL}/batch/tasks/{task_id}",
                headers=self._headers(),
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception:
            logger.exception("Failed to get batch task status for %s", task_id)
            return None

    def download_audio(self, audio_url: str, target_dir: Path) -> str | None:
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
            resp = requests.get(
                f"{self.BASE_URL}/static/voice/{audio_url}",
                timeout=120,
                headers=self._headers(),
            )
            resp.raise_for_status()
            ct = resp.headers.get("Content-Type", "")
            ext = ".wav" if "wav" in ct else ".mp3" if "mp3" in ct else ".wav"
            name = audio_url.split("/")[-1].split("?")[0]
            file_name = f"voice-{name}{ext}"
            dest = target_dir / file_name
            dest.write_bytes(resp.content)
            return file_name
        except Exception:
            logger.exception("Failed to download audio from %s", audio_url)
            return None

    @staticmethod
    def _mime(path: Path) -> str:
        import mimetypes
        return mimetypes.guess_type(str(path))[0] or "application/octet-stream"
