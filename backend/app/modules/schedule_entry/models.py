from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import AuditedMixin, Base


class ScheduleEntry(AuditedMixin, Base):
    """Personal calendar entry owned by a user.

    course_id is a soft reference (no FK) to allow client-side seed courses
    until the course management UI is wired up to this feature.
    """
    __tablename__ = "schedule_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    course_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    importance: Mapped[int] = mapped_column(Integer)

    __table_args__ = (
        CheckConstraint("importance >= 1 AND importance <= 10", name="ck_schedule_entry_importance"),
        CheckConstraint("end_at > start_at", name="ck_schedule_entry_time_order"),
    )
