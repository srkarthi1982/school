"""course selection: own material tables + seeded flag

Revision ID: m5s6l7m8t9a0
Revises: c8d9a0b1e2f3
Create Date: 2026-06-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "m5s6l7m8t9a0"
down_revision: Union[str, None] = "c8d9a0b1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "course_instances",
        sa.Column(
            "material_seeded", sa.Boolean(), nullable=False, server_default="false"
        ),
    )

    op.create_table(
        "course_selection_material_folders",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("course_instance_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.UUID(), nullable=True),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_instance_id"], ["course_instances.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["course_selection_material_folders.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["course_info_lesson_creation_lessons.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_selection_material_folders_course_instance_id",
        "course_selection_material_folders", ["course_instance_id"], unique=False,
    )
    op.create_index(
        "ix_course_selection_material_folders_parent_id",
        "course_selection_material_folders", ["parent_id"], unique=False,
    )
    op.create_index(
        "ix_course_selection_material_folders_lesson_id",
        "course_selection_material_folders", ["lesson_id"], unique=False,
    )

    op.create_table(
        "course_selection_material_files",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("course_instance_id", sa.Integer(), nullable=False),
        sa.Column("folder_id", sa.UUID(), nullable=True),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("uploader_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("thumbnail_key", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_instance_id"], ["course_instances.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["folder_id"], ["course_selection_material_folders.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["course_info_lesson_creation_lessons.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploader_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_selection_material_files_course_instance_id",
        "course_selection_material_files", ["course_instance_id"], unique=False,
    )
    op.create_index(
        "ix_course_selection_material_files_folder_id",
        "course_selection_material_files", ["folder_id"], unique=False,
    )
    op.create_index(
        "ix_course_selection_material_files_lesson_id",
        "course_selection_material_files", ["lesson_id"], unique=False,
    )


def downgrade() -> None:
    op.drop_table("course_selection_material_files")
    op.drop_table("course_selection_material_folders")
    op.drop_column("course_instances", "material_seeded")
