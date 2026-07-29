"""course selection: personnel completion + other personnel table

Revision ID: c0u2r3s4e5l6
Revises: 294602ec1e90
Create Date: 2026-06-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c0u2r3s4e5l6"
down_revision: Union[str, None] = "294602ec1e90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "course_instances",
        sa.Column("personnel_completion", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "course_other_personnel",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_instance_id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["course_instance_id"], ["course_instances.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_instance_id", "profile_id", name="uq_course_other_personnel"),
    )


def downgrade() -> None:
    op.drop_table("course_other_personnel")
    op.drop_column("course_instances", "personnel_completion")
