"""link material folders/files to lessons

Adds a nullable ``lesson_id`` foreign key on ``material_folders`` and
``material_files`` pointing at ``course_info_lesson_creation_lessons``.
ON DELETE CASCADE so removing a lesson removes the material uploaded under it.

Revision ID: m4t1l5e6c7d8
Revises: n0t1f5a6b3c9
Create Date: 2026-06-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m4t1l5e6c7d8"
down_revision: Union[str, None] = "n0t1f5a6b3c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "material_folders",
        sa.Column("lesson_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_material_folders_lesson_id",
        "material_folders",
        ["lesson_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_material_folders_lesson_id",
        "material_folders",
        "course_info_lesson_creation_lessons",
        ["lesson_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.add_column(
        "material_files",
        sa.Column("lesson_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_material_files_lesson_id",
        "material_files",
        ["lesson_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_material_files_lesson_id",
        "material_files",
        "course_info_lesson_creation_lessons",
        ["lesson_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_material_files_lesson_id", "material_files", type_="foreignkey"
    )
    op.drop_index("ix_material_files_lesson_id", table_name="material_files")
    op.drop_column("material_files", "lesson_id")

    op.drop_constraint(
        "fk_material_folders_lesson_id", "material_folders", type_="foreignkey"
    )
    op.drop_index("ix_material_folders_lesson_id", table_name="material_folders")
    op.drop_column("material_folders", "lesson_id")
