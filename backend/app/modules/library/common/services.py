"""WebSocket manager for library summarization status."""
import asyncio
import logging
from typing import Any

from fastapi import WebSocket

from app.core.database import SessionLocal

logger = logging.getLogger(__name__)


def _extract_websocket_token(websocket: WebSocket) -> str | None:
    query_token = websocket.query_params.get("token")
    if query_token:
        return query_token
    authorization = websocket.headers.get("authorization")
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip() or None
    return None


class LibrarySocketManager:
    """Track material_id → set of WebSocket subscribers. Supports:
    - Multiple users on same material
    - Same user on same material across multiple tabs
    - Dangling connection cleanup on push
    """

    def __init__(self) -> None:
        self._subscribers: dict[str, set[WebSocket]] = {}

    def connect(self, material_id: str, websocket: WebSocket) -> None:
        self._subscribers.setdefault(str(material_id), set()).add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        to_remove_keys = []
        for key, connections in self._subscribers.items():
            if websocket in connections:
                connections.discard(websocket)
                if not connections:
                    to_remove_keys.append(key)
        for key in to_remove_keys:
            del self._subscribers[key]

    async def push(self, material_id: str, payload: dict[str, Any]) -> None:
        ws_list = self._subscribers.get(material_id)
        if not ws_list:
            return
        for ws in list(ws_list):
            try:
                await ws.send_json(payload)
            except Exception:
                ws_list.discard(ws)  # remove stale connection

    async def push_status(self, material_id: int) -> None:
        """Fetch material summary from DB and push status update to subscribers."""
        db = None
        try:
            from ..models import MaterialSummary
            db = SessionLocal()
            summary = db.query(MaterialSummary).filter(
                MaterialSummary.id == material_id
            ).first()
            if not summary:
                return

            status_str = None
            if summary.summarize_ts:
                has_data = summary.summary or summary.mindmap or summary.narrative_text
                status_str = "Summary Available" if has_data else "Summary Not Available"

            payload = {
                "summarize_ts": summary.summarize_ts.isoformat() if summary.summarize_ts else None,
                "summarizing": summary.summarize_ts is None,
                "error_message": summary.error_message,
                "status": status_str,
            }

            await self.push(
                str(material_id),
                {**payload, "type": "library.summary_status", "material_id": str(material_id)},
            )
        except Exception:
            logger.exception("Failed to push summary status for material %s", material_id)
        finally:
            if db is not None:
                db.close()

    def push_status_sync(self, material_id: int) -> None:
        """Sync wrapper — for calling from APScheduler (non-async) context."""
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(self.push_status(material_id))
        finally:
            loop.close()

    @property
    def subscriber_count(self) -> int:
        total = sum(len(v) for v in self._subscribers.values())
        return total


manager = LibrarySocketManager()
