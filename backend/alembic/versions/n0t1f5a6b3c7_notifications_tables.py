"""notification_templates and notification_recipients tables

Revision ID: n0t1f5a6b3c7
Revises: c474c7dff160
Create Date: 2026-05-17 21:40:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = 'n0t1f5a6b3c7'
down_revision = 'c474c7dff160'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'notification_templates',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('type', sa.String(64), nullable=False, index=True),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('payload', JSONB(), nullable=True),
        sa.Column('source_module', sa.String(50), nullable=False, index=True),
        sa.Column('source_id', sa.String(64), nullable=True),
        sa.Column('link', sa.String(255), nullable=True),
        sa.Column('next_notifications_on', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'notification_recipients',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('notification_templates.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('recipient_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_notification_recipients_unread', 'notification_recipients', ['recipient_id', 'read_at'])


def downgrade() -> None:
    op.drop_index('ix_notification_recipients_unread', table_name='notification_recipients')
    op.drop_table('notification_recipients')
    op.drop_table('notification_templates')