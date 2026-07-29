"""add expires_at to class_sessions for breakout countdown

Revision ID: a1f2b3c4d5e6
Revises: 75dd7635fc9f
Create Date: 2026-05-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1f2b3c4d5e6'
down_revision: Union[str, None] = '74cfcfd916d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'class_sessions',
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('class_sessions', 'expires_at')
