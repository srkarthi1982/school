from collections.abc import Generator
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, declared_attr, mapped_column, sessionmaker
from sqlalchemy.engine import Engine

from app.core.config import settings

import logging

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_timeout=10,
    pool_recycle=1800,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass


class TimestampMixin:
    """Adds created_at / updated_at to any model."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AuditedMixin(TimestampMixin):
    """Adds optimistic-locking version counter and creator/updater FKs."""

    version: Mapped[int] = mapped_column(Integer, default=1)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    @declared_attr.directive
    def __mapper_args__(cls):
        # Wire SQLAlchemy's built-in optimistic locking to the version column.
        # On UPDATE, emits: WHERE id=X AND version=N  and auto-increments to N+1.
        # Raises StaleDataError if another transaction already bumped the version.
        return {"version_id_col": cls.version}


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

_sql_logger = logging.getLogger(__name__)

@event.listens_for(Engine, "before_cursor_execute")
def _sql_audit_listener(conn, cursor, statement, parameters, context, executemany):
    if settings.DEBUG or settings.SQL_LOG_LEVEL == "INFO":
        _sql_logger.info("SQL: %s | params: %s", statement, parameters)
