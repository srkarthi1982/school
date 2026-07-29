"""lesson planning half-day training days and periods per half day

Revision ID: f3a7b1c9d2e5
Revises: e701d8615662
Create Date: 2026-06-11 00:00:00.000000

Allows half-day training weeks on the Lesson Planning tab:
  * ``number_of_training_days_per_week`` becomes a float (e.g. 5.5); the schema
    constrains it to whole/half increments.
  * adds ``number_of_periods_per_half_day`` (integer, nullable).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3a7b1c9d2e5"
down_revision: Union[str, None] = "e701d8615662"
# down_revision: Union[str, None] = "6ae2da7957a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "course_info_lesson_planning",
        "number_of_training_days_per_week",
        existing_type=sa.Integer(),
        type_=sa.Float(),
        existing_nullable=True,
        postgresql_using="number_of_training_days_per_week::double precision",
    )
    op.add_column(
        "course_info_lesson_planning",
        sa.Column("number_of_periods_per_half_day", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column(
        "course_info_lesson_planning",
        "number_of_periods_per_half_day",
    )
    op.alter_column(
        "course_info_lesson_planning",
        "number_of_training_days_per_week",
        existing_type=sa.Float(),
        type_=sa.Integer(),
        existing_nullable=True,
        postgresql_using="round(number_of_training_days_per_week)::integer",
    )
