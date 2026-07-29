"""course info: move ctp_version from course_info_general to course_masters

CTP Version is a course-level attribute edited on the General tab. Moving it
onto ``course_masters`` lets it be read directly off the master (e.g. for the
course-selection picklist) without loading the General tab row.

Revision ID: e2c3t4p5v6r7
Revises: d1r2e3c4t5t6
Create Date: 2026-06-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2c3t4p5v6r7"
down_revision: Union[str, None] = "d1r2e3c4t5t6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "course_masters", sa.Column("ctp_version", sa.String(length=100), nullable=True)
    )
    op.execute(
        "UPDATE course_masters cm "
        "SET ctp_version = g.ctp_version "
        "FROM course_info_general g "
        "WHERE g.course_master_id = cm.id"
    )
    op.drop_column("course_info_general", "ctp_version")


def downgrade() -> None:
    op.add_column(
        "course_info_general",
        sa.Column("ctp_version", sa.String(length=100), nullable=True),
    )
    op.execute(
        "UPDATE course_info_general g "
        "SET ctp_version = cm.ctp_version "
        "FROM course_masters cm "
        "WHERE g.course_master_id = cm.id"
    )
    op.drop_column("course_masters", "ctp_version")
