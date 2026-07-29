"""merge lesson-creation and student/teacher-cleanup heads

Revision ID: 294602ec1e90
Revises: 53b190edf7f3, b9d3f5a7c2e1
Create Date: 2026-06-12 05:02:05.199697

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '294602ec1e90'
down_revision: Union[str, None] = ('53b190edf7f3', 'b9d3f5a7c2e1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
