"""course masters: unique constraint on (title, ctp_version)

Revision ID: f3t4i5t6c7p8
Revises: e2c3t4p5v6r7
Create Date: 2026-06-13

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3t4i5t6c7p8"
down_revision: Union[str, None] = "e2c3t4p5v6r7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_course_masters_title_ctp_version",
        "course_masters",
        ["title", "ctp_version"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_course_masters_title_ctp_version", "course_masters", type_="unique"
    )
