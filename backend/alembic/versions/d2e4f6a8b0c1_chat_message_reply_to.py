"""chat_message_reply_to

Revision ID: d2e4f6a8b0c1
Revises: f0a55b923726
Create Date: 2026-07-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd2e4f6a8b0c1'
down_revision: Union[str, None] = 'f0a55b923726'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('chat_messages', sa.Column('reply_to_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_chat_messages_reply_to_id',
        'chat_messages',
        'chat_messages',
        ['reply_to_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_chat_messages_reply_to_id', 'chat_messages', type_='foreignkey')
    op.drop_column('chat_messages', 'reply_to_id')
