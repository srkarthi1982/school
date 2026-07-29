"""lesson creation: instructor ratio, location, health & safety, resources

Revision ID: a8c2e4f6b1d9
Revises: f3a7b1c9d2e5
Create Date: 2026-06-11 00:30:00.000000

Adds per-lesson fields to ``course_info_lesson_creation_lessons``
(instructor/student ratio, location, health & safety) and a new child table
``course_info_lesson_creation_lesson_resources`` holding the resources a
lesson attaches (polymorphic category + master row id).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a8c2e4f6b1d9"
down_revision: Union[str, None] = "f3a7b1c9d2e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "course_info_lesson_creation_lessons",
        sa.Column("instructor_student_ratio", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "course_info_lesson_creation_lessons",
        sa.Column("location", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "course_info_lesson_creation_lessons",
        sa.Column("health_and_safety", sa.Text(), nullable=True),
    )

    op.create_table(
        "course_info_lesson_creation_lesson_resources",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "course_info_lesson_creation_lesson_id", sa.Integer(), nullable=False
        ),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_lesson_creation_lesson_id"],
            ["course_info_lesson_creation_lessons.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cilc_lesson_resources_lesson_id",
        "course_info_lesson_creation_lesson_resources",
        ["course_info_lesson_creation_lesson_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_cilc_lesson_resources_lesson_id",
        table_name="course_info_lesson_creation_lesson_resources",
    )
    op.drop_table("course_info_lesson_creation_lesson_resources")

    op.drop_column("course_info_lesson_creation_lessons", "health_and_safety")
    op.drop_column("course_info_lesson_creation_lessons", "location")
    op.drop_column("course_info_lesson_creation_lessons", "instructor_student_ratio")
