"""add task_id to material_summaries

Revision ID: e2f9n7h3a8d1
Revises: 3d3c4cd07051
Create Date: 2026-07-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2f9n7h3a8d1'
# down_revision: Union[str, None] = 'a1c2d3e4f5a6'
down_revision: Union[str, None] = '3d3c4cd07051'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'material_summaries',
        sa.Column('task_id', sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('material_summaries', 'task_id')
