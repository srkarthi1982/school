"""add total_pages and library_material_id to material_files

Revision ID: a9df1fdc92b7
Revises: a9df1fdc92b6
Create Date: 2026-07-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a9df1fdc92b7'
down_revision: Union[str, None] = 'a9df1fdc92b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('material_files',
                  sa.Column('total_pages', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('material_files',
                  sa.Column('library_material_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('material_files', 'library_material_id')
    op.drop_column('material_files', 'total_pages')
