from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.users.models import User


# Use JSONB on PostgreSQL for indexing/query support; fall back to JSON (TEXT)
# on SQLite and other dialects so tests don't require a live Postgres instance.
_JSON = JSONB().with_variant(JSON(), "sqlite")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    table_name: Mapped[str] = mapped_column(String(100))
    row_id: Mapped[str] = mapped_column(String(50))
    operation: Mapped[str] = mapped_column(String(10))  # INSERT | UPDATE | DELETE
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    before_data: Mapped[dict | None] = mapped_column(_JSON, nullable=True)
    after_data: Mapped[dict | None] = mapped_column(_JSON, nullable=True)
    changed_fields: Mapped[list | None] = mapped_column(_JSON, nullable=True)

    user: Mapped["User | None"] = relationship(viewonly=True)

    @property
    def user_name(self) -> str | None:
        """Display name of the acting user (full name, falling back to username)."""
        if self.user is None:
            return None
        return self.user.full_name or self.user.username
