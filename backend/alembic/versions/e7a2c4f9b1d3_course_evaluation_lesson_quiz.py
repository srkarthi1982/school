"""course builder evaluation: lesson↔quiz associations

Creates the ``evaluations`` table (one row per CourseMaster, mirroring
``materials``) and the ``evaluation_lesson_quizzes`` association table that
links a course lesson (``course_info_lesson_creation_lessons``) to a quiz
(``quizzes``). ON DELETE CASCADE throughout so deleting a master, lesson, or
quiz cleans up the associations. A unique constraint prevents duplicate links.

Revision ID: e7a2c4f9b1d3
Revises: d3f1a9c5b7e2
Create Date: 2026-06-03 16:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7a2c4f9b1d3"
down_revision: Union[str, Sequence[str], None] = "d3f1a9c5b7e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. evaluations (one per course master) — mirrors materials.
    op.create_table(
        "evaluations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_master_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'incomplete'"),
        ),
        sa.Column(
            "version", sa.Integer(), nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
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
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_master_id", name="uq_evaluations_course_master_id"),
    )
    op.create_index(
        "ix_evaluations_course_master_id",
        "evaluations",
        ["course_master_id"],
        unique=False,
    )

    # 2. evaluation_lesson_quizzes (lesson ↔ quiz association).
    op.create_table(
        "evaluation_lesson_quizzes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("evaluation_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column("quiz_id", sa.Integer(), nullable=False),
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
            ["evaluation_id"], ["evaluations.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["course_info_lesson_creation_lessons.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["quiz_id"], ["quizzes.id"], ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "evaluation_id", "lesson_id", "quiz_id",
            name="uq_evaluation_lesson_quiz",
        ),
    )
    op.create_index(
        "ix_evaluation_lesson_quizzes_evaluation_id",
        "evaluation_lesson_quizzes",
        ["evaluation_id"],
        unique=False,
    )
    op.create_index(
        "ix_evaluation_lesson_quizzes_lesson_id",
        "evaluation_lesson_quizzes",
        ["lesson_id"],
        unique=False,
    )
    op.create_index(
        "ix_evaluation_lesson_quizzes_quiz_id",
        "evaluation_lesson_quizzes",
        ["quiz_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_evaluation_lesson_quizzes_quiz_id",
        table_name="evaluation_lesson_quizzes",
    )
    op.drop_index(
        "ix_evaluation_lesson_quizzes_lesson_id",
        table_name="evaluation_lesson_quizzes",
    )
    op.drop_index(
        "ix_evaluation_lesson_quizzes_evaluation_id",
        table_name="evaluation_lesson_quizzes",
    )
    op.drop_table("evaluation_lesson_quizzes")

    op.drop_index("ix_evaluations_course_master_id", table_name="evaluations")
    op.drop_table("evaluations")
