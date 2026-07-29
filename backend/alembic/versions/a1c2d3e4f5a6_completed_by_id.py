"""add completed_by_id to lesson completions

Revision ID: a1c2d3e4f5a6
Revises: 1b7da618e066
Create Date: 2026-07-09 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import reflection

# revision identifiers, used by Alembic.
revision = "a1c2d3e4f5a6"
down_revision = "1b7da618e066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Only add the column if it doesn't already exist (safe re-run).
    conn = op.get_bind()
    inspector = reflection.Inspector.from_engine(conn)
    columns = [c["name"] for c in inspector.get_columns("course_selection_lesson_completions")]
    if "completed_by_id" in columns:
        return

    # Add nullable first so we can populate existing rows.
    op.add_column(
        "course_selection_lesson_completions",
        sa.Column("completed_by_id", sa.Integer(), nullable=True),
    )
    # Populate existing rows: copy student_id into completed_by_id.
    op.execute(
        "UPDATE course_selection_lesson_completions "
        "SET completed_by_id = student_id"
    )
    # Now enforce NOT NULL with the FK constraint.
    op.alter_column(
        "course_selection_lesson_completions",
        "completed_by_id",
        nullable=False,
    )
    op.create_foreign_key(
        "fk_cs_lesson_completions_completed_by",
        "course_selection_lesson_completions",
        "profiles",
        ["completed_by_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_cs_lesson_completions_completed_by", "course_selection_lesson_completions", type_="foreignkey")
    op.drop_column("course_selection_lesson_completions", "completed_by_id")
