"""course builder form builder: survey links (and merge survey/evaluation heads)

Creates the ``form_builders`` table (one row per CourseMaster, mirroring
``evaluations``) and the ``form_builder_survey_links`` association table that
links a survey (``surveys``) to a course lesson
(``course_info_lesson_creation_lessons``) or — when ``lesson_id`` is NULL — to
the course itself. ON DELETE CASCADE throughout so deleting a master, lesson, or
survey cleans up the links. A unique constraint prevents duplicate lesson links
(course-level duplicates are guarded in the service layer).

This revision also merges the two open heads (survey schedule + evaluation).

Revision ID: c5e1a7d9f2b4
Revises: b7f3a1c9d2e4, e7a2c4f9b1d3
Create Date: 2026-06-08 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5e1a7d9f2b4"
down_revision: Union[str, Sequence[str], None] = ("b7f3a1c9d2e4", "e7a2c4f9b1d3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. form_builders (one per course master) — mirrors evaluations.
    op.create_table(
        "form_builders",
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
        sa.UniqueConstraint(
            "course_master_id", name="uq_form_builders_course_master_id"
        ),
    )
    op.create_index(
        "ix_form_builders_course_master_id",
        "form_builders",
        ["course_master_id"],
        unique=False,
    )

    # 2. form_builder_survey_links (survey ↔ lesson, or survey ↔ course when NULL).
    op.create_table(
        "form_builder_survey_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("form_builder_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("survey_id", sa.Integer(), nullable=False),
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
            ["form_builder_id"], ["form_builders.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["course_info_lesson_creation_lessons.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["survey_id"], ["surveys.id"], ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "form_builder_id", "lesson_id", "survey_id",
            name="uq_form_builder_survey_link",
        ),
    )
    op.create_index(
        "ix_form_builder_survey_links_form_builder_id",
        "form_builder_survey_links",
        ["form_builder_id"],
        unique=False,
    )
    op.create_index(
        "ix_form_builder_survey_links_lesson_id",
        "form_builder_survey_links",
        ["lesson_id"],
        unique=False,
    )
    op.create_index(
        "ix_form_builder_survey_links_survey_id",
        "form_builder_survey_links",
        ["survey_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_form_builder_survey_links_survey_id",
        table_name="form_builder_survey_links",
    )
    op.drop_index(
        "ix_form_builder_survey_links_lesson_id",
        table_name="form_builder_survey_links",
    )
    op.drop_index(
        "ix_form_builder_survey_links_form_builder_id",
        table_name="form_builder_survey_links",
    )
    op.drop_table("form_builder_survey_links")

    op.drop_index("ix_form_builders_course_master_id", table_name="form_builders")
    op.drop_table("form_builders")
