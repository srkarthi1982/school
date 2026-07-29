"""course selection: own form + evaluation tables + seeded flags

Revision ID: f6r7m8e9v0a1
Revises: m5s6l7m8t9a0
Create Date: 2026-06-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6r7m8e9v0a1"
down_revision: Union[str, None] = "m5s6l7m8t9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "course_instances",
        sa.Column("surveys_seeded", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "course_instances",
        sa.Column("evaluation_seeded", sa.Boolean(), nullable=False, server_default="false"),
    )

    # --- Form: survey links ------------------------------------------------
    op.create_table(
        "course_selection_form_survey_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_instance_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("survey_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["course_instance_id"], ["course_instances.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lesson_id"], ["course_info_lesson_creation_lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["survey_id"], ["surveys.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_instance_id", "lesson_id", "survey_id",
            name="uq_course_selection_form_survey_link",
        ),
    )
    op.create_index(
        "ix_course_selection_form_survey_links_course_instance_id",
        "course_selection_form_survey_links", ["course_instance_id"], unique=False,
    )
    op.create_index(
        "ix_course_selection_form_survey_links_lesson_id",
        "course_selection_form_survey_links", ["lesson_id"], unique=False,
    )
    op.create_index(
        "ix_course_selection_form_survey_links_survey_id",
        "course_selection_form_survey_links", ["survey_id"], unique=False,
    )

    # --- Form: form links --------------------------------------------------
    op.create_table(
        "course_selection_form_form_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_instance_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("form_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["course_instance_id"], ["course_instances.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lesson_id"], ["course_info_lesson_creation_lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["form_id"], ["forms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_instance_id", "lesson_id", "form_id",
            name="uq_course_selection_form_form_link",
        ),
    )
    op.create_index(
        "ix_course_selection_form_form_links_course_instance_id",
        "course_selection_form_form_links", ["course_instance_id"], unique=False,
    )
    op.create_index(
        "ix_course_selection_form_form_links_lesson_id",
        "course_selection_form_form_links", ["lesson_id"], unique=False,
    )
    op.create_index(
        "ix_course_selection_form_form_links_form_id",
        "course_selection_form_form_links", ["form_id"], unique=False,
    )

    # --- Evaluation: lesson↔quiz associations ------------------------------
    op.create_table(
        "course_selection_evaluation_lesson_quizzes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_instance_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("quiz_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("assessment_type", sa.String(length=20), nullable=True),
        sa.Column("max_mark", sa.Integer(), nullable=False),
        sa.Column("pass_mark", sa.Integer(), nullable=False),
        sa.Column("pass_percentage", sa.Integer(), nullable=False),
        sa.Column("percentage_allocation", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["course_instance_id"], ["course_instances.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lesson_id"], ["course_info_lesson_creation_lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quiz_id"], ["quizzes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_instance_id", "lesson_id", "quiz_id",
            name="uq_course_selection_evaluation_lesson_quiz",
        ),
    )
    # Index names kept short to stay within Postgres' 63-char identifier limit.
    op.create_index(
        "ix_cs_eval_quiz_course_instance_id",
        "course_selection_evaluation_lesson_quizzes", ["course_instance_id"], unique=False,
    )
    op.create_index(
        "ix_cs_eval_quiz_lesson_id",
        "course_selection_evaluation_lesson_quizzes", ["lesson_id"], unique=False,
    )
    op.create_index(
        "ix_cs_eval_quiz_quiz_id",
        "course_selection_evaluation_lesson_quizzes", ["quiz_id"], unique=False,
    )


def downgrade() -> None:
    op.drop_table("course_selection_evaluation_lesson_quizzes")
    op.drop_table("course_selection_form_form_links")
    op.drop_table("course_selection_form_survey_links")
    op.drop_column("course_instances", "evaluation_seeded")
    op.drop_column("course_instances", "surveys_seeded")
