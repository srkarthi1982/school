from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class MaterialFolder(TimestampMixin, Base):
    __tablename__ = "material_folders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("material_folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_info_lesson_creation_lessons.id",
                   ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    parent: Mapped["MaterialFolder | None"] = relationship(
        "MaterialFolder", remote_side="MaterialFolder.id", back_populates="children"
    )
    children: Mapped[list["MaterialFolder"]] = relationship(
        "MaterialFolder", back_populates="parent", cascade="all, delete-orphan"
    )
    files: Mapped[list["MaterialFile"]] = relationship(
        "MaterialFile", back_populates="folder", cascade="all, delete-orphan"
    )


class MaterialFile(TimestampMixin, Base):
    __tablename__ = "material_files"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("material_folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("course_info_lesson_creation_lessons.id",                   ondelete="CASCADE"),
                                                  nullable=True,
                                                  index=True,
                                                  )
    uploader_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    thumbnail_key: Mapped[str | None] = mapped_column(
        String(500), nullable=True)
    total_pages: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0)
    library_material_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True)

    folder: Mapped[MaterialFolder | None] = relationship(
        "MaterialFolder", back_populates="files")
    uploader = relationship("User", foreign_keys=[uploader_id], lazy="joined")


__all__ = ["MaterialFolder", "MaterialFile"]
