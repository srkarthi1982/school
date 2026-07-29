from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class CourseSelectionMaterialFolder(TimestampMixin, Base):
    """Material folder owned by a single Course Selection instance.

    Mirrors :class:`app.modules.material.models.MaterialFolder` but is keyed off
    ``course_instance_id`` instead of ``course_master_id``. The rows are seeded
    by copying the master's material the first time the instance's Material
    category is opened, then edited independently of the master.
    """

    __tablename__ = "course_selection_material_folders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_selection_material_folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    parent: Mapped["CourseSelectionMaterialFolder | None"] = relationship(
        "CourseSelectionMaterialFolder",
        remote_side="CourseSelectionMaterialFolder.id",
        back_populates="children",
    )
    children: Mapped[list["CourseSelectionMaterialFolder"]] = relationship(
        "CourseSelectionMaterialFolder", back_populates="parent", cascade="all, delete-orphan"
    )
    files: Mapped[list["CourseSelectionMaterialFile"]] = relationship(
        "CourseSelectionMaterialFile", back_populates="folder", cascade="all, delete-orphan"
    )


class CourseSelectionMaterialFile(TimestampMixin, Base):
    __tablename__ = "course_selection_material_files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_selection_material_folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"),
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
    thumbnail_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    total_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    folder: Mapped[CourseSelectionMaterialFolder | None] = relationship(
        "CourseSelectionMaterialFolder", back_populates="files"
    )
    uploader = relationship("User", foreign_keys=[uploader_id], lazy="joined")


class CourseSelectionMaterialUserProgress(TimestampMixin, Base):
    """Per-user reading progress for a lesson material file (Schedule Management
    in-app reader). Mirrors ``LibraryMaterialUserProgress`` but is keyed by the
    UUID ``file_id`` of a :class:`CourseSelectionMaterialFile`, so the Progress
    Tracker can compute real material-completion per course instance. A file is
    "completed" for a user when ``total_pages > 0 and pages_read >= total_pages``.
    """

    __tablename__ = "course_selection_material_user_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "file_id", name="uq_csm_user_progress_user_file"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_selection_material_files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pages_read: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


__all__ = [
    "CourseSelectionMaterialFolder",
    "CourseSelectionMaterialFile",
    "CourseSelectionMaterialUserProgress",
]
