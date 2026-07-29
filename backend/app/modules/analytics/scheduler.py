from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import settings
from app.core.database import SessionLocal

from . import buffer, service

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _flush_buffer() -> None:
    db = SessionLocal()
    try:
        n = buffer.drain_and_insert(db)
        if n:
            logger.debug("analytics: flushed %s usage events", n)
    finally:
        db.close()


def _snapshot() -> None:
    db = SessionLocal()
    try:
        service.snapshot_concurrency(db)
    except Exception:
        logger.exception("analytics concurrency snapshot failed")
    finally:
        db.close()


def _rollup_and_purge() -> None:
    db = SessionLocal()
    try:
        service.run_daily_rollup(db)
        purged = service.purge_old_raw(db)
        if purged:
            logger.info("analytics: purged %s expired usage events", purged)
    except Exception:
        logger.exception("analytics rollup/purge failed")
    finally:
        db.close()


def start_scheduler() -> None:
    """Start the analytics jobs. Idempotent — safe to call twice."""
    global _scheduler
    if _scheduler is not None:
        return

    if not settings.ANALYTICS_TRACKING_ENABLED:
        return

    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(
        _flush_buffer,
        trigger="interval",
        seconds=settings.ANALYTICS_FLUSH_SECONDS,
        id="analytics_flush_buffer",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        _snapshot,
        trigger="interval",
        minutes=settings.ANALYTICS_SNAPSHOT_MINUTES,
        id="analytics_concurrency_snapshot",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    # Nightly at 03:00 server time: roll up the previous day, then purge.
    scheduler.add_job(
        _rollup_and_purge,
        trigger="cron",
        hour=3,
        minute=0,
        id="analytics_daily_rollup_purge",
        replace_existing=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info("analytics scheduler started")


def stop_scheduler() -> None:
    """Stop jobs and flush any buffered events so shutdown loses nothing extra."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
    # Final drain on the way down.
    try:
        _flush_buffer()
    except Exception:
        logger.exception("analytics: final flush on shutdown failed")
