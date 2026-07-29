"""add_simulation_flying_to_attendance_status

Revision ID: 20230603addsimfly
Revises: f6dc191f9a13
Create Date: 2026-06-03 06:30:45.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20230603addsimfly"
down_revision = "f6dc191f9a13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new enum values to the existing PostgreSQL enum type used by the attendances table.
    # The enum is named "attendancestatus" (see initial schema migration).
    op.execute("ALTER TYPE attendancestatus ADD VALUE IF NOT EXISTS 'SIMULATION'")
    op.execute("ALTER TYPE attendancestatus ADD VALUE IF NOT EXISTS 'FLYING'")


def downgrade() -> None:
    # Removing enum values is not straightforward in PostgreSQL.
    # This downgrade is left intentionally empty; the added values will remain.
    pass