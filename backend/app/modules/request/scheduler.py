from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.database import SessionLocal
from app.modules.request.services import scan_overdue

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_scan_overdue() -> None:
    """Open a fresh DB session per tick and run the overdue scan."""
    db = SessionLocal()
    try:
        count = scan_overdue(db)
        if count:
            logger.info("request overdue scan: notified %s request(s)", count)
    except Exception:
        logger.exception("request overdue scan failed")
    finally:
        db.close()


def start_scheduler() -> None:
    """Start the daily overdue scanner. Idempotent — safe to call twice."""
    global _scheduler
    if _scheduler is not None:
        return

    scheduler = BackgroundScheduler(daemon=True)
    # Run at 02:00 server time daily plus once at startup so a fresh deploy
    # picks up any already-overdue rows without waiting 24h.
    scheduler.add_job(
        _run_scan_overdue,
        trigger="cron",
        hour=2,
        minute=0,
        id="request_overdue_scan_daily",
        replace_existing=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info("request overdue scheduler started")

    # Fire one scan immediately on startup (non-blocking via add_job with no trigger).
    try:
        _run_scan_overdue()
    except Exception:
        logger.exception("initial request overdue scan failed")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
