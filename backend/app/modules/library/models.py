from datetime import datetime
from typing import Any
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, LargeBinary, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import AuditedMixin, Base, TimestampMixin
from sqlalchemy.dialects.postgresql import JSONB

#from app.modules.users.models import User

class LibraryMaterial(TimestampMixin, Base):
    __tablename__ = "library_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    file_id: Mapped[str] = mapped_column(String(120), nullable=False)
    file_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(260), nullable=True)
    content_type: Mapped[str | None] = mapped_column(
        String(120), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(120), nullable=False)
    material_type: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[str] = mapped_column(String(60), nullable=False)
    upload_date: Mapped[DateTime] = mapped_column(DateTime(), nullable=False)
    folder: Mapped[str] = mapped_column(String(220), nullable=False)
    uploaded_by: Mapped[str | None] = mapped_column(String(220), nullable=True)
    approved_status: Mapped[str] = mapped_column(
        String(120), nullable=False, default='approved')
    metadata_json: Mapped[str] = mapped_column('metadata_json', Text)
    #pagesRead: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    totalPages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #coverimage: Mapped[bytes] = mapped_column(LargeBinary, nullable=True)

    summary: Mapped["MaterialSummary"] = relationship(
        back_populates="library_material", uselist=False, cascade="all,delete-orphan")
    user_progress: Mapped[list["LibraryMaterialUserProgress"]] = relationship(
        "LibraryMaterialUserProgress",
        back_populates="material",
        cascade="all, delete-orphan",
    )

class MaterialSummary(AuditedMixin, Base):
    __tablename__ = "material_summaries"

    id: Mapped[int] = mapped_column(
        ForeignKey("library_materials.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        primary_key=True,
        index=True,
    )

    material_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="library"
    )

    summary: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True)
    narrative_text: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONB, nullable=True)
    narrative_voice: Mapped[str | None] = mapped_column(String, nullable=True)
    mindmap: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True)

    summarize_ts: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    error_message: Mapped[str | None] = mapped_column(String, nullable=True)

    task_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # One-to-One relationship
    library_material: Mapped["LibraryMaterial"] = relationship(
        back_populates="summary", uselist=False)

# ---------------------------------------------------------------------------
# User‑specific reading progress for a library material
# ---------------------------------------------------------------------------
class LibraryMaterialUserProgress(TimestampMixin, Base):
    __tablename__ = "library_material_user_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "material_id", name="uq_library_material_user_progress_user_material"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    material_id: Mapped[int] = mapped_column(
        ForeignKey("library_materials.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    pages_read: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # user: Mapped["User"] = relationship(
    #     "User", back_populates="material_progress"
    # )
    material: Mapped["LibraryMaterial"] = relationship(
        "LibraryMaterial", back_populates="user_progress"
    )