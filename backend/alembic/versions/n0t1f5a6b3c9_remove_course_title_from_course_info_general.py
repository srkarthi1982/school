"""remove course_title from course_info_general

Revision ID: n0t1f5a6b3c9
Revises: n0t1f5a6b3c8
Create Date: 2026-05-23 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n0t1f5a6b3c9"
down_revision: Union[str, None] = "n0t1f5a6b3c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("course_info_general", "course_title")


def downgrade() -> None:
    op.add_column(
        "course_info_general",
        sa.Column("course_title", sa.String(length=255), nullable=True),
    )