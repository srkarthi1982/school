import logging
import logging.config
from contextvars import ContextVar

from app.core.config import settings

request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)


class RequestIdFilter(logging.Filter):
    """Inject the current request ID into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get() or "-"  # type: ignore[attr-defined]
        return True


def setup_logging() -> None:
    handlers: dict[str, dict] = {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "filters": ["request_id"],
            "stream": "ext://sys.stdout",
        },
    }
    if settings.LOG_TO_FILE:
        settings.LOG_DIR.mkdir(parents=True, exist_ok=True)
        handlers["file"] = {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": str(settings.LOG_DIR / "app.log"),
            "when": "midnight",
            "backupCount": 14,
            "encoding": "utf-8",
            "delay": True,
            "formatter": "default",
            "filters": ["request_id"],
        }

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": {
                "request_id": {"()": lambda: RequestIdFilter()},
            },
            "formatters": {
                "default": {
                    "format": (
                        "%(asctime)s %(levelname)-8s [%(name)s] [%(request_id)s] %(message)s"
                    ),
                },
            },
            "handlers": handlers,
            "root": {
                "level": settings.LOG_LEVEL,
                "handlers": list(handlers),
            },
            "loggers": {
                "uvicorn": {"level": "INFO"},
                "uvicorn.access": {"level": "WARNING"},
                "sqlalchemy.engine": {"level": settings.SQL_LOG_LEVEL},
                "apscheduler": {"level": "ERROR"},
                "apscheduler.*": {"level": "ERROR"},
                "app.core.database": {"level": "WARNING"},
            },
        }
    )
