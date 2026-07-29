"""course masters: case-insensitive unique on (lower(title), ctp_version)

Replaces the case-sensitive UNIQUE(title, ctp_version) constraint with a
functional UNIQUE index on ``(lower(title), ctp_version)`` so that titles
differing only in case (e.g. "ABC" vs "Abc") with the same CTP Version are
treated as duplicates.

Revision ID: f4c5i6t7c8p9
Revises: f3t4i5t6c7p8
Create Date: 2026-06-13

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f4c5i6t7c8p9"
down_revision: Union[str, None] = "f3t4i5t6c7p8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "uq_course_masters_title_ctp_version", "course_masters", type_="unique"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_course_masters_lower_title_ctp_version "
        "ON course_masters (lower(title), ctp_version)"
    )


def downgrade() -> None:
    op.drop_index("uq_course_masters_lower_title_ctp_version", table_name="course_masters")
    op.create_unique_constraint(
        "uq_course_masters_title_ctp_version",
        "course_masters",
        ["title", "ctp_version"],
    )
