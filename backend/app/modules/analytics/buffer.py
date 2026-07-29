"""In-memory, per-worker event buffer.

Middleware appends event dicts here in ~0 ms; the analytics scheduler drains and
bulk-inserts them every few seconds. Each uvicorn worker has its own buffer and
flushes to the same table, which is correct — no cross-worker sharing needed.

A crash loses at most the currently-buffered (few seconds') events; that is an
accepted trade-off for keeping request latency untouched.
"""

from __future__ import annotations

import logging
from collections import deque
from threading import Lock

from sqlalchemy.orm import Session

from .models import UsageEvent

logger = logging.getLogger(__name__)

# Hard cap so a stuck/slow flusher can never exhaust memory. When full, the
# oldest events are dropped (deque maxlen) — we favour liveness over completeness.
_MAX_BUFFER = 50_000

_buffer: deque[dict] = deque(maxlen=_MAX_BUFFER)
_lock = Lock()


def append(event: dict) -> None:
    """Enqueue one event. Non-blocking and never raises."""
    try:
        _buffer.append(event)
    except Exception:  # pragma: no cover - defensive; must never break a request
        logger.exception("failed to enqueue usage event")


def drain_and_insert(db: Session) -> int:
    """Drain the buffer and bulk-insert as UsageEvent rows. Returns count written."""
    batch: list[dict] = []
    with _lock:
        while _buffer:
            batch.append(_buffer.popleft())
    if not batch:
        return 0
    try:
        db.bulk_insert_mappings(UsageEvent, batch)
        db.commit()
        return len(batch)
    except Exception:
        db.rollback()
        logger.exception("failed to flush %s usage events", len(batch))
        return 0
