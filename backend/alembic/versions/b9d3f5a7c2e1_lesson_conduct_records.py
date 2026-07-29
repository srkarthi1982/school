"""lesson creation: conduct records (BEGINNING/MIDDLE/END)

Revision ID: b9d3f5a7c2e1
Revises: a8c2e4f6b1d9
Create Date: 2026-06-11 01:00:00.000000

Adds ``course_info_lesson_creation_lesson_conducts`` — per-lesson conduct
records grouped by part (BEGINNING/MIDDLE/END) with free-text point, material
and notes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b9d3f5a7c2e1"
down_revision: Union[str, None] = "a8c2e4f6b1d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "course_info_lesson_creation_lesson_conducts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "course_info_lesson_creation_lesson_id", sa.Integer(), nullable=False
        ),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("part", sa.String(length=20), nullable=True),
        sa.Column("point", sa.Text(), nullable=True),
        sa.Column("material", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_lesson_creation_lesson_id"],
            ["course_info_lesson_creation_lessons.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cilc_lesson_conducts_lesson_id",
        "course_info_lesson_creation_lesson_conducts",
        ["course_info_lesson_creation_lesson_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_cilc_lesson_conducts_lesson_id",
        table_name="course_info_lesson_creation_lesson_conducts",
    )
    op.drop_table("course_info_lesson_creation_lesson_conducts")
