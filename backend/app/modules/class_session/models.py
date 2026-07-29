from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import AuditedMixin, Base


class ClassSession(AuditedMixin, Base):
    """Virtual classroom session backed by a LiveKit room.

    POC: minimal fields to support create/start/end/join. Recording and
    breakout-specific fields (recordings table, parent_session_id self-FK)
    are present but unused until full v1.
    """
    __tablename__ = "class_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    host_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    livekit_room_name: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(16))  # SCHEDULED|LIVE|ENDED|CANCELLED
    scheduled_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    scheduled_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    max_participants: Mapped[int] = mapped_column(Integer, default=10)
    parent_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("class_sessions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Whitelist of user IDs allowed to /join. NULL or empty = open to anyone
    # with the class_session:join permission. The host and any admin user
    # always bypass this list. Stored as JSON for v1; v2 may switch to a
    # proper junction table once enrollment integration lands.
    participant_user_ids: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    # Soft deadline used by breakouts: when host sets duration_minutes at
    # create time, expires_at = now + duration. The host's frontend
    # polls the countdown and calls /close once it hits zero. NULL means
    # no timer — manual close only. Only meaningful on breakout child
    # sessions; the parent's scheduled_end serves the same role.
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        CheckConstraint("scheduled_end > scheduled_start", name="ck_class_session_time_order"),
        CheckConstraint(
            "max_participants > 0 AND max_participants <= 200",
            name="ck_class_session_max_participants",
        ),
        CheckConstraint(
            "status IN ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED')",
            name="ck_class_session_status",
        ),
    )


class ClassSessionRecording(AuditedMixin, Base):
    """A LiveKit Egress room-composite recording for a class session.

    Lifecycle:
      STARTING — POST /recordings issued, awaiting LiveKit egress server
      ACTIVE   — egress_started webhook received
      FINISHED — egress_ended webhook received with file metadata
      FAILED   — egress_ended received with non-success status
      ABORTED  — operator stopped before any frames were captured

    Egress writes the encoded MP4 to file_path (a path inside the
    operator's mounted recordings volume). file_size_bytes and
    duration_seconds are populated via the egress_ended webhook payload.
    """
    __tablename__ = "class_session_recordings"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("class_sessions.id", ondelete="CASCADE"), index=True
    )
    egress_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('STARTING', 'ACTIVE', 'FINISHED', 'FAILED', 'ABORTED')",
            name="ck_class_session_recording_status",
        ),
    )
