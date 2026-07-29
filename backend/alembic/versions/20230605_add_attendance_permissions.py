"""add_attendance_permissions

Revision ID: 20230605add
Revises: b3a17e2f9c01
Create Date: 2026-06-05 02:30:00.000000

"""
from typing import Sequence, Union
from datetime import datetime

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20230605add"
down_revision: Union[str, None] = "b3a17e2f9c01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Insert attendance module permissions."""
    permissions = sa.table(
        "permissions",
        sa.Column("code"),
        sa.Column("name"),
        sa.Column("description"),
        sa.Column("module"),
        sa.Column("created_at"),
        sa.Column("updated_at"),
    )

    op.bulk_insert(
        permissions,
        [
            {
                "code": "attendance:verify",
                "name": "Verify Attendance",
                "description": "Verify attendance records",
                "module": "attendance",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            },
            {
                "code": "attendance:approve",
                "name": "ApproveAttendance",
                "description": "Approve attendance records",
                "module": "attendance",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            },
        ],
    )


def downgrade() -> None:
    """Remove the inserted attendance permissions."""
    op.execute(
        sa.text(
            "DELETE FROM permissions WHERE code IN ('attendance:verify', 'attendance:approve')"
        )
    )