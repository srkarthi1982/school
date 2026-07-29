"""course_instance_stop_resume

Revision ID: s1t2o3p4r5s6
Revises: e1x2t3e4n5d6
Create Date: 2026-07-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 's1t2o3p4r5s6'
down_revision: Union[str, None] = 'e1x2t3e4n5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS: dev databases with alembic drift may already carry the
    # columns from a manual apply.
    op.execute(
        'ALTER TABLE course_instances '
        'ADD COLUMN IF NOT EXISTS stopped_at DATE NULL'
    )
    op.execute(
        'ALTER TABLE course_instances '
        'ADD COLUMN IF NOT EXISTS stopped_days INTEGER NOT NULL DEFAULT 0'
    )


def downgrade() -> None:
    op.execute('ALTER TABLE course_instances DROP COLUMN IF EXISTS stopped_at')
    op.execute('ALTER TABLE course_instances DROP COLUMN IF EXISTS stopped_days')
