"""course builder evaluation: lesson↔form associations

Creates the ``evaluation_lesson_forms`` association table that links a course
lesson (``course_info_lesson_creation_lessons``) — or the whole course master
when ``lesson_id`` is NULL — to a form (``forms``). Mirrors
``evaluation_lesson_quizzes`` but without the per-association assessment config;
a form is a plain attachment. ON DELETE CASCADE throughout so deleting a master,
lesson, or form cleans up the associations. A unique constraint prevents
duplicate links.

Revision ID: e2f4l6f8o0r2
Revises: 3f9c2a1b7e4d
Create Date: 2026-06-16 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e2f4l6f8o0r2"
down_revision: Union[str, Sequence[str], None] = "3f9c2a1b7e4d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "evaluation_lesson_forms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_master_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("form_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_master_id"], ["course_masters.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["course_info_lesson_creation_lessons.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["form_id"], ["forms.id"], ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_master_id", "lesson_id", "form_id",
            name="uq_evaluation_lesson_form",
        ),
    )
    op.create_index(
        "ix_evaluation_lesson_forms_course_master_id",
        "evaluation_lesson_forms",
        ["course_master_id"],
        unique=False,
    )
    op.create_index(
        "ix_evaluation_lesson_forms_lesson_id",
        "evaluation_lesson_forms",
        ["lesson_id"],
        unique=False,
    )
    op.create_index(
        "ix_evaluation_lesson_forms_form_id",
        "evaluation_lesson_forms",
        ["form_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_evaluation_lesson_forms_form_id",
        table_name="evaluation_lesson_forms",
    )
    op.drop_index(
        "ix_evaluation_lesson_forms_lesson_id",
        table_name="evaluation_lesson_forms",
    )
    op.drop_index(
        "ix_evaluation_lesson_forms_course_master_id",
        table_name="evaluation_lesson_forms",
    )
    op.drop_table("evaluation_lesson_forms")
