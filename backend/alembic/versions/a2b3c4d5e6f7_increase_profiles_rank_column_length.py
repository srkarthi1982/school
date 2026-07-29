"""increase_profiles_rank_column_length

Revision ID: a2b3c4d5e6f7
Revises: d4eaec168c66
Create Date: 2026-07-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'd4eaec168c66'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('profiles', 'rank',
               existing_type=sa.VARCHAR(length=20),
               type_=sa.VARCHAR(length=100),
               existing_nullable=False)


def downgrade() -> None:
    op.alter_column('profiles', 'rank',
               existing_type=sa.VARCHAR(length=100),
               type_=sa.VARCHAR(length=20),
               existing_nullable=False)
