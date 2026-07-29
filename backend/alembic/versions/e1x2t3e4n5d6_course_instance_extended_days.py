"""course_instance_extended_days

Revision ID: e1x2t3e4n5d6
Revises: a2b3c4d5e6f7
Create Date: 2026-07-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e1x2t3e4n5d6'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS: dev databases with alembic drift may already carry the
    # column from a manual apply.
    op.execute(
        'ALTER TABLE course_instances '
        'ADD COLUMN IF NOT EXISTS extended_days INTEGER NOT NULL DEFAULT 0'
    )


def downgrade() -> None:
    op.execute('ALTER TABLE course_instances DROP COLUMN IF EXISTS extended_days')
