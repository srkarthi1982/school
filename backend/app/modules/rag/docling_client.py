"""Client for the external docling-serve document-conversion service.

Output modes (settings.DOCLING_MODE):

* ``convert_json`` (default) — request ``to_formats=json`` and return the
  DoclingDocument dict. Markdown output is lossy and drops page provenance, so
  we always ask for JSON and chunk in-process (see ``chunker.py``) to keep page
  numbers.
* ``chunk_endpoint`` — call the server's hybrid-chunk endpoint and return chunk
  dicts directly (lighter, but page provenance depends on the server version).

Submission style (settings.DOCLING_ASYNC), for ``convert_json``:

* sync (default) — ``POST /v1/convert/file`` holds the connection until the
  conversion finishes.
* async task API — ``POST /v1/convert/file/async`` returns a ``task_id``; we then
  poll ``GET /v1/status/poll/{id}`` until ``task_status`` is success/failure and
  fetch ``GET /v1/result/{id}``. No long-held connection; lighter on docling-serve
  when conversions are slow or queued. We still block the calling (worker) thread
  via a sleep-poll loop — that matches the sync ingestion pipeline.

Mirrors ``library/summarizer_client.py`` (multipart file upload to a configurable
sidecar).
"""
from __future__ import annotations

import json
import logging
import time

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)



# Custom prompt for image/picture description.
_PICTURE_DESC_PROMPT = (
    "/no_think Analyze this image thoroughly. Describe all visible elements including: text "
    "content (in any language, including Arabic, English, and other scripts), object, vehicle, aircraft, charts, "
    "diagrams, tables, graphs, logos, and any visual data. If there are numbers or "
    "labels, include them. If there is Arabic text, transcribe it accurately in Arabic "
    "script. Be detailed and precise."
)


class DoclingError(RuntimeError):
    """Raised when docling-serve fails or returns an unusable payload."""


class DoclingClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None) -> None:
        self.base_url = (base_url or settings.DOCLING_BASE_URL).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.DOCLING_API_KEY
        self._client = httpx.Client(
            verify=settings.DOCLING_VERIFY_SSL,
            timeout=settings.DOCLING_TIMEOUT_SECONDS,
        )

    def _headers(self) -> dict[str, str]:
        h = {"Accept": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    @staticmethod
    def _build_convert_data(to_formats: str = "json") -> dict[str, str | int | bool]:
        """Build the multipart form-data dict for document conversion.

        Includes picture classification/description configuration and enrichment flags.
        """
        data: dict[str, str | int | bool] = {
            "to_formats": to_formats,
            "do_picture_classification": True,
            # Enrichments.
            "do_code_enrichment": True,
            "do_formula_enrichment": True,
        }
        # Picture description needs an external vision endpoint; only enable it
        # when one is configured, so a bare deployment converts cleanly.
        if settings.DOCLING_PICTURE_DESC_URL:
            headers = {}
            if settings.DOCLING_PICTURE_DESC_API_KEY:
                headers["Authorization"] = f"Bearer {settings.DOCLING_PICTURE_DESC_API_KEY}"
            data.update({
                "do_picture_description": True,
                "bitmap_area_treshold": 0.75,
                "picture_description_custom_config": json.dumps({
                    "model_spec": {
                        "name": "qwen-picture-desc",
                        "default_repo_id": settings.DOCLING_PICTURE_DESC_MODEL,
                        "prompt": _PICTURE_DESC_PROMPT,
                        "response_format": "plaintext",
                    },
                    "engine_options": {
                        "engine_type": "api",
                        "url": settings.DOCLING_PICTURE_DESC_URL,
                        "headers": headers,
                        "params": {
                            "model": settings.DOCLING_PICTURE_DESC_MODEL,
                            "max_completions_tokens": 2048,
                            "chat_template_kwargs": {"enable_thinking": False},
                        },
                        "timeout": 60,
                    },
                }),
            })
        return data

    def convert_to_docling_json(
        self, file_bytes: bytes, filename: str, content_type: str
    ) -> dict:
        """Convert one file and return the DoclingDocument as a dict."""
        payload = self._convert_async_task(file_bytes, filename, content_type)
        doc = self._extract_json_content(payload)
        if doc is None:
            raise DoclingError("docling-serve response has no DoclingDocument JSON.")
        return doc

    def _convert_async_task(
        self, file_bytes: bytes, filename: str, content_type: str
    ) -> dict:
        """Submit → poll → fetch via docling-serve's async task API.

        Returns the same result envelope as the sync endpoint so the caller's
        ``_extract_json_content`` handles both identically.
        """
        data = self._build_convert_data("json")
        submit = self._client.post(
            f"{self.base_url}/v1/convert/file/async",
            headers=self._headers(),
            files={"files": (filename, file_bytes, content_type or "application/octet-stream")},
            data=data,
        )
        submit.raise_for_status()
        task = submit.json()
        task_id = task.get("task_id")
        if not task_id:
            raise DoclingError("docling-serve async submit returned no task_id.")

        interval = max(0.2, settings.DOCLING_POLL_INTERVAL_SECONDS)
        deadline = time.monotonic() + settings.DOCLING_TIMEOUT_SECONDS
        status = task.get("task_status")
        while status not in ("success", "failure"):
            if time.monotonic() > deadline:
                raise DoclingError(
                    f"docling-serve async task {task_id} timed out (last status={status})."
                )
            time.sleep(interval)
            poll = self._client.get(
                f"{self.base_url}/v1/status/poll/{task_id}", headers=self._headers()
            )
            poll.raise_for_status()
            status = poll.json().get("task_status")

        if status == "failure":
            raise DoclingError(f"docling-serve async task {task_id} failed.")

        result = self._client.get(
            f"{self.base_url}/v1/result/{task_id}", headers=self._headers()
        )
        result.raise_for_status()
        return result.json()

    def chunk_hybrid(
        self, file_bytes: bytes, filename: str, content_type: str
    ) -> list[dict]:
        """Call the server-side hybrid chunk endpoint (chunk_endpoint mode)."""
        resp = self._client.post(
            f"{self.base_url}/v1/chunk/hybrid/file",
            headers=self._headers(),
            files={"files": (filename, file_bytes, content_type or "application/octet-stream")},
            data={
                "chunking_tokenizer": settings.DOCLING_CHUNK_TOKENIZER,
                "max_tokens": str(settings.DOCLING_MAX_TOKENS),
                "merge_peers": str(settings.DOCLING_MERGE_PEERS).lower(),
            },
        )
        resp.raise_for_status()
        payload = resp.json()
        chunks = payload.get("chunks") or payload.get("documents") or []
        if not isinstance(chunks, list):
            raise DoclingError("docling-serve chunk response has no chunk list.")
        return chunks

    @staticmethod
    def _extract_json_content(payload: dict):
        """Pull the DoclingDocument dict out of the (version-dependent) envelope."""
        if not isinstance(payload, dict):
            return None
        doc = payload.get("document", payload)
        if isinstance(doc, dict):
            content = doc.get("json_content", doc)
            if isinstance(content, str):
                return json.loads(content)
            if isinstance(content, dict):
                # A bare DoclingDocument has a "schema_name"/"body"; the wrapper
                # dict without json_content would not, so guard lightly.
                return content
        return None

    def close(self) -> None:
        try:
            self._client.close()
        except Exception:
            pass
