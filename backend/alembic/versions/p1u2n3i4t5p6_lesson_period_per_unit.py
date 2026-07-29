"""lesson creation: period per unit

Adds an integer ``period_per_unit`` field to the Lesson Creation lessons of
both the course master (``course_info_lesson_creation_lessons``) and the course
instance (``course_selection_info_lesson_creation_lessons``). It holds the size
(number of periods) of a block unit used when the lesson is laid out on the
schedule.

Revision ID: p1u2n3i4t5p6
Revises: c5l6i7n8k9m0
Create Date: 2026-06-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "p1u2n3i4t5p6"
down_revision: Union[str, None] = "c5l6i7n8k9m0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES = (
    "course_info_lesson_creation_lessons",
    "course_selection_info_lesson_creation_lessons",
)


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column("period_per_unit", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    for table in _TABLES:
        op.drop_column(table, "period_per_unit")
