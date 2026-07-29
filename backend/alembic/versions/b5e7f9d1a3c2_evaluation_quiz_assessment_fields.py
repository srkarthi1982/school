"""course builder evaluation: quiz assessment fields

Adds per-association assessment configuration to
``evaluation_lesson_quizzes``: ``assessment_type`` (theory/practical), and the
integer ``max_mark``, ``pass_mark``, ``pass_percentage`` and
``percentage_allocation`` columns. The combined ``percentage_allocation`` of all
quizzes in a lesson (or the course) must not exceed 100 — enforced in the
service layer.

Revision ID: b5e7f9d1a3c2
Revises: a4d6e8c2f0b1
Create Date: 2026-06-08 13:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b5e7f9d1a3c2"
down_revision: Union[str, Sequence[str], None] = "a4d6e8c2f0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "evaluation_lesson_quizzes",
        sa.Column("assessment_type", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "evaluation_lesson_quizzes",
        sa.Column(
            "max_mark", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
    )
    op.add_column(
        "evaluation_lesson_quizzes",
        sa.Column(
            "pass_mark", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
    )
    op.add_column(
        "evaluation_lesson_quizzes",
        sa.Column(
            "pass_percentage",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "evaluation_lesson_quizzes",
        sa.Column(
            "percentage_allocation",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("evaluation_lesson_quizzes", "percentage_allocation")
    op.drop_column("evaluation_lesson_quizzes", "pass_percentage")
    op.drop_column("evaluation_lesson_quizzes", "pass_mark")
    op.drop_column("evaluation_lesson_quizzes", "max_mark")
    op.drop_column("evaluation_lesson_quizzes", "assessment_type")
