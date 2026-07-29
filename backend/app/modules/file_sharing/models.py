from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class SharedFolder(TimestampMixin, Base):
    __tablename__ = "shared_folders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shared_folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    parent: Mapped[SharedFolder | None] = relationship("SharedFolder", remote_side="SharedFolder.id", back_populates="children")
    children: Mapped[list[SharedFolder]] = relationship("SharedFolder", back_populates="parent", cascade="all, delete-orphan")
    files: Mapped[list[SharedFile]] = relationship("SharedFile", back_populates="folder", cascade="all, delete-orphan")


class SharedFile(TimestampMixin, Base):
    __tablename__ = "shared_files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shared_folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    thumbnail_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    folder: Mapped[SharedFolder | None] = relationship("SharedFolder", back_populates="files")
    uploader = relationship("User", foreign_keys=[uploader_id], lazy="joined")


__all__ = ["SharedFolder", "SharedFile"]
