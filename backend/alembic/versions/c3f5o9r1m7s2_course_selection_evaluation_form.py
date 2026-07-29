"""course selection: evaluation lesson↔form associations

Creates ``course_selection_evaluation_lesson_forms``, the instance-owned mirror
of ``evaluation_lesson_forms``. Seeded by copying the master's evaluation form
associations the first time the instance's Evaluation category is opened (see
``course_selection_evaluation.services.seed_from_master``), then edited
independently. ON DELETE CASCADE throughout; a unique constraint prevents
duplicate links.

Revision ID: c3f5o9r1m7s2
Revises: e2f4l6f8o0r2
Create Date: 2026-06-16 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3f5o9r1m7s2"
down_revision: Union[str, Sequence[str], None] = "e2f4l6f8o0r2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "course_selection_evaluation_lesson_forms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_instance_id", sa.Integer(), nullable=False),
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
            ["course_instance_id"], ["course_instances.id"], ondelete="CASCADE",
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
            "course_instance_id", "lesson_id", "form_id",
            name="uq_course_selection_evaluation_lesson_form",
        ),
    )
    # Index names kept short to stay within Postgres' 63-char identifier limit.
    op.create_index(
        "ix_cs_eval_form_course_instance_id",
        "course_selection_evaluation_lesson_forms",
        ["course_instance_id"],
        unique=False,
    )
    op.create_index(
        "ix_cs_eval_form_lesson_id",
        "course_selection_evaluation_lesson_forms",
        ["lesson_id"],
        unique=False,
    )
    op.create_index(
        "ix_cs_eval_form_form_id",
        "course_selection_evaluation_lesson_forms",
        ["form_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_cs_eval_form_form_id",
        table_name="course_selection_evaluation_lesson_forms",
    )
    op.drop_index(
        "ix_cs_eval_form_lesson_id",
        table_name="course_selection_evaluation_lesson_forms",
    )
    op.drop_index(
        "ix_cs_eval_form_course_instance_id",
        table_name="course_selection_evaluation_lesson_forms",
    )
    op.drop_table("course_selection_evaluation_lesson_forms")
