"""chat_participant_hidden_at

Revision ID: e8b1c2d3f4a5
Revises: d913f41b7413
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8b1c2d3f4a5'
down_revision: Union[str, None] = 'd913f41b7413'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('chat_conversation_participants',
    sa.Column('hidden_at', sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('chat_conversation_participants', 'hidden_at')
