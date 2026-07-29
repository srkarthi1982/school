"""Per-student send targeting for quiz / form / survey

Adds three recipient tables so a teacher can send a quiz, form, or survey directly
to hand-picked students without linking it to a course or lesson. student_id is a
users.id (matching quiz_attempts.student_id and the users.id stored — as text — in
the form/survey response tables).

Revision ID: s8a1b2c3d4e5
Revises: r7p8q9s0t1u2
Create Date: 2026-07-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "s8a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "r7p8q9s0t1u2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_recipient_table(name: str, parent_table: str, parent_col: str, uq_name: str) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(parent_col, sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("sent_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            [parent_col], [f"{parent_table}.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sent_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(parent_col, "student_id", name=uq_name),
    )
    op.create_index(op.f(f"ix_{name}_{parent_col}"), name, [parent_col], unique=False)
    op.create_index(op.f(f"ix_{name}_student_id"), name, ["student_id"], unique=False)


def upgrade() -> None:
    _create_recipient_table("quiz_recipients", "quizzes", "quiz_id", "uq_quiz_recipient")
    _create_recipient_table("form_recipients", "forms", "form_id", "uq_form_recipient")
    _create_recipient_table("survey_recipients", "surveys", "survey_id", "uq_survey_recipient")


def downgrade() -> None:
    op.drop_table("survey_recipients")
    op.drop_table("form_recipients")
    op.drop_table("quiz_recipients")
