"""add summarize_ts to library_material_summaries

Revision ID: 6ae2da7957a3
Revises: c7f610e503b8
Create Date: 2026-06-24 08:37:28.934644

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6ae2da7957a3'
down_revision: Union[str, None] = 'c7f610e503b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('library_material_summaries', sa.Column('summarize_ts', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('library_material_summaries', 'summarize_ts')
