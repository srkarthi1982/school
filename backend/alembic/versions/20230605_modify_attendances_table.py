"""modify_attendances_table

Revision ID: 20230605mod
Revises: 20230605add
Create Date: 2026-06-05 03:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20230605mod"
down_revision: Union[str, None] = "20230605add"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make section_id nullable
    op.alter_column(
        "attendances",
        "section_id",
        existing_type=sa.Integer(),
        nullable=True,
    )

    # Add locked column if it does not exist
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'attendances' AND column_name = 'locked'
            ) THEN
                ALTER TABLE attendances
                ADD COLUMN locked BOOLEAN NOT NULL DEFAULT FALSE;
            END IF;
        END
        $$;
        """
    )

    # Add level column if it does not exist
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'attendances' AND column_name = 'level'
            ) THEN
                ALTER TABLE attendances
                ADD COLUMN level INTEGER NOT NULL DEFAULT 0;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    # Revert section_id to not nullable (assumes original was NOT NULL)
    op.alter_column(
        "attendances",
        "section_id",
        existing_type=sa.Integer(),
        nullable=False,
    )

    # Drop the columns added in upgrade
    op.drop_column("attendances", "locked")
    op.drop_column("attendances", "level")