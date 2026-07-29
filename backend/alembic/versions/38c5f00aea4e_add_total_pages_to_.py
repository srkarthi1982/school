"""add total_pages to CourseSelectionMaterialFile

Revision ID: 38c5f00aea4e
Revises: 48337241ec9b
Create Date: 2026-07-08 06:54:01.545581

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '38c5f00aea4e'
down_revision: Union[str, None] = '48337241ec9b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('course_selection_material_files',
                  sa.Column('total_pages', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('course_selection_material_files', 'total_pages')
