"""course builder schedule: course_schedules, days, placements (+ merge heads)

Revision ID: s1c2h3e4d5u6
Revises: b2306ab3f629, m4t1l5e6c7d8
Create Date: 2026-06-07 00:00:00.000000

Adds the Course Builder Schedule tables and, in passing, merges the two
existing migration heads into one. The schedule grid SHAPE is derived live
from Course Information, so only status + day rows + lesson placements are
persisted here.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "s1c2h3e4d5u6"
down_revision: Union[str, Sequence[str], None] = ("b2306ab3f629", "m4t1l5e6c7d8")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. course_schedules (audited, one per course master)
    op.create_table(
        "course_schedules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_master_id", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'created'"),
        ),
        sa.Column(
            "version", sa.Integer(), nullable=False, server_default=sa.text("1"),
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
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_master_id", name="uq_course_schedules_course_master_id",
        ),
    )
    op.create_index(
        "ix_course_schedules_course_master_id",
        "course_schedules",
        ["course_master_id"],
        unique=False,
    )

    # 2. course_schedule_days
    op.create_table(
        "course_schedule_days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_schedule_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False, server_default=sa.text("0"),
        ),
        sa.Column("day_label", sa.String(length=50), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_schedule_id"], ["course_schedules.id"], ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_schedule_days_course_schedule_id",
        "course_schedule_days",
        ["course_schedule_id"],
        unique=False,
    )

    # 3. course_schedule_placements
    op.create_table(
        "course_schedule_placements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_schedule_day_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False, server_default=sa.text("0"),
        ),
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column(
            "start_col", sa.Integer(), nullable=False, server_default=sa.text("0"),
        ),
        sa.Column(
            "span", sa.Integer(), nullable=False, server_default=sa.text("1"),
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_schedule_day_id"], ["course_schedule_days.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["course_info_lesson_creation_lessons.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_schedule_placements_course_schedule_day_id",
        "course_schedule_placements",
        ["course_schedule_day_id"],
        unique=False,
    )
    op.create_index(
        "ix_course_schedule_placements_lesson_id",
        "course_schedule_placements",
        ["lesson_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_course_schedule_placements_lesson_id",
        table_name="course_schedule_placements",
    )
    op.drop_index(
        "ix_course_schedule_placements_course_schedule_day_id",
        table_name="course_schedule_placements",
    )
    op.drop_table("course_schedule_placements")
    op.drop_index(
        "ix_course_schedule_days_course_schedule_id",
        table_name="course_schedule_days",
    )
    op.drop_table("course_schedule_days")
    op.drop_index(
        "ix_course_schedules_course_master_id",
        table_name="course_schedules",
    )
    op.drop_table("course_schedules")
