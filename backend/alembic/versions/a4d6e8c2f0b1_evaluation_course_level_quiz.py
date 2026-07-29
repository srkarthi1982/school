"""course builder evaluation: course-level quiz associations

Makes ``evaluation_lesson_quizzes.lesson_id`` nullable so a quiz can be
associated with the whole course (NULL ``lesson_id``) — the "course" row pinned
on top of the lesson list — mirroring the Form Builder survey/form links.
Duplicate course-level links are guarded in the service layer (NULL is distinct
per row in Postgres, so the unique constraint does not catch them).

Revision ID: a4d6e8c2f0b1
Revises: f1c3e5a7b9d2
Create Date: 2026-06-08 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4d6e8c2f0b1"
down_revision: Union[str, Sequence[str], None] = "f1c3e5a7b9d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "evaluation_lesson_quizzes",
        "lesson_id",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    # Course-level rows (lesson_id IS NULL) cannot satisfy a NOT NULL column;
    # drop them before tightening the constraint back.
    op.execute(
        "DELETE FROM evaluation_lesson_quizzes WHERE lesson_id IS NULL"
    )
    op.alter_column(
        "evaluation_lesson_quizzes",
        "lesson_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
