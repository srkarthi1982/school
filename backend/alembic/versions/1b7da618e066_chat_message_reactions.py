"""chat_message_reactions

Revision ID: 1b7da618e066
Revises: 003e09d253c1
Create Date: 2026-07-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1b7da618e066'
down_revision: Union[str, None] = '003e09d253c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'chat_message_reactions',
        sa.Column('message_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('emoji', sa.String(length=16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['message_id'], ['chat_messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('message_id', 'user_id'),
    )
    op.create_index(
        'ix_chat_message_reactions_message_id', 'chat_message_reactions', ['message_id']
    )


def downgrade() -> None:
    op.drop_index('ix_chat_message_reactions_message_id', table_name='chat_message_reactions')
    op.drop_table('chat_message_reactions')
