"""add currencies_certificate_completion column

Revision ID: a9b8c7d6e5f4
Revises: 976d2a98395a
Create Date: 2026-06-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9b8c7d6e5f4'
down_revision: Union[str, None] = '976d2a98395a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('course_masters',
        sa.Column('currencies_certificate_completion',
                  sa.Integer(), nullable=False, server_default='0')
    )


def downgrade() -> None:
    op.drop_column('course_masters', 'currencies_certificate_completion')
