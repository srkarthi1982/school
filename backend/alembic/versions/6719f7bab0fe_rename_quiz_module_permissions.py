"""split rename quiz module name

Revision ID: 6719f7bab0fe
Revises: e7a3b9d28f1c
Create Date: 2026-05-06 09:00:00.000000

Rename module name from quiz to quiz_bank
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6719f7bab0fe'
down_revision: Union[str, None] = 'e7a3b9d28f1c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.execute(sa.text("UPDATE permissions SET MODULE='quiz_bank' WHERE MODULE='quiz'"))

def downgrade() -> None:
    op.execute(sa.text("UPDATE permissions SET MODULE='quiz' WHERE MODULE='quiz_bank'"))