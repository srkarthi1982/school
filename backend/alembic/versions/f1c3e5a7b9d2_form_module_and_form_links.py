"""form module tables, form_builder form links, and form permissions

Creates the six ``form_*`` content tables (a 1:1 clone of the survey schema,
including the scheduling/assignment columns and per-question timing) plus the
``form_builder_form_links`` association table. Also registers the
``form:creator/take/view`` permissions and grants each to every role that holds
the matching ``survey:*`` permission, so Form mirrors Survey for existing roles.

Revision ID: f1c3e5a7b9d2
Revises: d8b2f4a6c1e0
Create Date: 2026-06-08 11:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1c3e5a7b9d2"
down_revision: Union[str, Sequence[str], None] = "d8b2f4a6c1e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_PERMISSIONS = [
    ("form:creator", "Manage Form", "View, add, update, and delete form"),
    ("form:take", "Take Form", "Take form"),
    ("form:view", "View Form", "Form View"),
]

# form:X is granted to every role holding survey:X.
_GRANT_FROM = {
    "form:creator": "survey:creator",
    "form:take": "survey:take",
    "form:view": "survey:view",
}


def upgrade() -> None:
    # --- form content tables (clone of survey schema) ---
    op.create_table(
        "form_question_pool",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False),
        sa.Column("required", sa.Boolean(), server_default=sa.text("false"), nullable=False, comment="Whether answering this question is mandatory"),
        sa.Column("allow_multiple", sa.Boolean(), server_default=sa.text("'false'"), nullable=False, comment="Whether to show checkboxes (multiple) instead of radio (single)"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_form_question_pool_id"), "form_question_pool", ["id"], unique=False)

    op.create_table(
        "forms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), server_default=sa.text("'draft'"), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("assignment_type", sa.String(length=32), server_default=sa.text("'general'"), nullable=False),
        sa.Column("assignee_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_forms_id"), "forms", ["id"], unique=False)
    op.create_index(op.f("ix_forms_course_id"), "forms", ["course_id"], unique=False)

    op.create_table(
        "form_pool_answer_options",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=True, comment="Optional weight used for scoring; null = default 1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["question_id"], ["form_question_pool.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_form_pool_answer_options_id"), "form_pool_answer_options", ["id"], unique=False)
    op.create_index(op.f("ix_form_pool_answer_options_question_id"), "form_pool_answer_options", ["question_id"], unique=False)

    op.create_table(
        "form_questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("form_id", sa.Integer(), nullable=False),
        sa.Column("pool_question_id", sa.Integer(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False),
        sa.Column("required", sa.Boolean(), server_default=sa.text("false"), nullable=False, comment="Whether answering this question is mandatory"),
        sa.Column("allow_multiple", sa.Boolean(), server_default=sa.text("'false'"), nullable=False, comment="Whether to show checkboxes (multiple) instead of radio (single)"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["pool_question_id"], ["form_question_pool.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["form_id"], ["forms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_form_questions_id"), "form_questions", ["id"], unique=False)
    op.create_index(op.f("ix_form_questions_form_id"), "form_questions", ["form_id"], unique=False)

    op.create_table(
        "form_student_responses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("form_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Text(), nullable=False),
        sa.Column("answers", sa.JSON(), nullable=True),
        sa.Column("question_times", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("is_started", sa.Boolean(), nullable=False),
        sa.Column("is_finished", sa.Boolean(), nullable=False),
        sa.Column("current_index", sa.Integer(), nullable=True),
        sa.Column("overall_grade", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["form_id"], ["forms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_form_student_responses_id"), "form_student_responses", ["id"], unique=False)
    op.create_index(op.f("ix_form_student_responses_form_id"), "form_student_responses", ["form_id"], unique=False)

    op.create_table(
        "form_answer_options",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=True, comment="Optional weight used for scoring; null = default 1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["question_id"], ["form_questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_form_answer_options_id"), "form_answer_options", ["id"], unique=False)
    op.create_index(op.f("ix_form_answer_options_question_id"), "form_answer_options", ["question_id"], unique=False)

    # --- form_builder ↔ form association table ---
    op.create_table(
        "form_builder_form_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("form_builder_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("form_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["form_builder_id"], ["form_builders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lesson_id"], ["course_info_lesson_creation_lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["form_id"], ["forms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("form_builder_id", "lesson_id", "form_id", name="uq_form_builder_form_link"),
    )
    op.create_index("ix_form_builder_form_links_form_builder_id", "form_builder_form_links", ["form_builder_id"], unique=False)
    op.create_index("ix_form_builder_form_links_lesson_id", "form_builder_form_links", ["lesson_id"], unique=False)
    op.create_index("ix_form_builder_form_links_form_id", "form_builder_form_links", ["form_id"], unique=False)

    # --- permissions + role grants (mirror survey) ---
    for code, name, description in _PERMISSIONS:
        op.execute(
            sa.text(
                """
                INSERT INTO permissions (code, name, description, module, created_at, updated_at)
                SELECT :code, :name, :description, 'form', now(), now()
                WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.code = :code)
                """
            ).bindparams(code=code, name=name, description=description)
        )

    for form_code, survey_code in _GRANT_FROM.items():
        op.execute(
            sa.text(
                """
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT rp.role_id, fp.id
                FROM role_permissions rp
                JOIN permissions sp ON sp.id = rp.permission_id AND sp.code = :survey_code
                JOIN permissions fp ON fp.code = :form_code
                WHERE NOT EXISTS (
                    SELECT 1 FROM role_permissions x
                    WHERE x.role_id = rp.role_id AND x.permission_id = fp.id
                )
                """
            ).bindparams(survey_code=survey_code, form_code=form_code)
        )

    op.execute(sa.text("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))"))


def downgrade() -> None:
    codes = [c for c, _, _ in _PERMISSIONS]
    op.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE code = ANY(:codes))"
        ).bindparams(codes=codes)
    )
    op.execute(sa.text("DELETE FROM permissions WHERE code = ANY(:codes)").bindparams(codes=codes))

    op.drop_table("form_builder_form_links")
    op.drop_index(op.f("ix_form_answer_options_question_id"), table_name="form_answer_options")
    op.drop_index(op.f("ix_form_answer_options_id"), table_name="form_answer_options")
    op.drop_table("form_answer_options")
    op.drop_index(op.f("ix_form_student_responses_form_id"), table_name="form_student_responses")
    op.drop_index(op.f("ix_form_student_responses_id"), table_name="form_student_responses")
    op.drop_table("form_student_responses")
    op.drop_index(op.f("ix_form_questions_form_id"), table_name="form_questions")
    op.drop_index(op.f("ix_form_questions_id"), table_name="form_questions")
    op.drop_table("form_questions")
    op.drop_index(op.f("ix_form_pool_answer_options_question_id"), table_name="form_pool_answer_options")
    op.drop_index(op.f("ix_form_pool_answer_options_id"), table_name="form_pool_answer_options")
    op.drop_table("form_pool_answer_options")
    op.drop_index(op.f("ix_forms_course_id"), table_name="forms")
    op.drop_index(op.f("ix_forms_id"), table_name="forms")
    op.drop_table("forms")
    op.drop_index(op.f("ix_form_question_pool_id"), table_name="form_question_pool")
    op.drop_table("form_question_pool")
