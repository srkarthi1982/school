"""add error_message to material_summaries

Revision ID: 48337241ec9b
Revises: eb4fe0919d1b
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '48337241ec9b'
down_revision: Union[str, None] = 'eb4fe0919d1b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('material_summaries', sa.Column('error_message', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('material_summaries', 'error_message')
