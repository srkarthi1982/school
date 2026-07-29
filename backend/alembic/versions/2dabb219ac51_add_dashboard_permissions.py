"""Add dashboard permissions.

Revision ID: 2dabb219ac51
Revises: a1c2d3e4f5a6
Create Date: 2026-07-08 03:55:00.000000

"""

from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers, used by Alembic.
revision = "2dabb219ac51"
down_revision = "a1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Insert dashboard permissions."""
    op.execute(
        """
        INSERT INTO permissions (code, name, description, module, created_at, updated_at)
        VALUES
            ('dashboard:leadership', 'Dashboard Leadership View', 'Dashboard leadership view', 'dashboard', NOW(), NOW()),
            ('dashboard:sat', 'Dashboard SAT View', 'Dashboard SAT view', 'dashboard', NOW(), NOW()),
            ('dashboard:instructor', 'Dashboard Instructor View', 'Dashboard instructor view', 'dashboard', NOW(), NOW()),
            ('dashboard:student', 'Dashboard Student View', 'Dashboard student view', 'dashboard', NOW(), NOW());
        """
    )


def downgrade() -> None:
    """Remove dashboard permissions."""
    op.execute(
        """
        DELETE FROM permissions
        WHERE code IN (
            'dashboard_leadership',
            'dashboard_sat',
            'dashboard_instructor',
            'dashboard_student'
        );
        """
    )