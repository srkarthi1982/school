"""make quizzes.type nullable (and merge heads)

Revision ID: d3f1a9c5b7e2
Revises: b2306ab3f629, m4t1l5e6c7d8
Create Date: 2026-06-03 15:30:00.000000

A quiz's ``type`` is derived from the question types attached to it (see
``update_quiz_type_if_necessary`` in the quiz_bank router), so it is NULL until
questions are added. The deployed schema had a NOT NULL constraint on
``quizzes.type`` which broke quiz creation; this relaxes it to nullable to match
the model and the original quiz_bank migration. This revision also merges the two
open heads (``b2306ab3f629`` and ``m4t1l5e6c7d8``).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d3f1a9c5b7e2"
down_revision: Union[str, Sequence[str], None] = ("b2306ab3f629", "m4t1l5e6c7d8")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "quizzes", "type", existing_type=sa.String(length=32), nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        "quizzes", "type", existing_type=sa.String(length=32), nullable=False
    )
