"""course selection: own currencies & certificate tables

Revision ID: c8s9t0u1v2w3
Revises: p9r8o7f6m5r4
Create Date: 2026-06-24 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8s9t0u1v2w3'
down_revision: Union[str, None] = 'p9r8o7f6m5r4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### course_selection_info_currency_selected ─────────────────────────
    op.create_table('course_selection_info_currency_selected',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_instance_id', sa.Integer(), nullable=False),
        sa.Column('currency_master_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['course_instance_id'], ['course_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['currency_master_id'], ['currencies_master.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_cscs_instance_id', 'course_selection_info_currency_selected', ['course_instance_id'])
    op.create_index('ix_cscs_currency_id', 'course_selection_info_currency_selected', ['currency_master_id'])

    # ### course_selection_info_certificate (AuditedMixin adds version) ──
    op.create_table('course_selection_info_certificate',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_instance_id', sa.Integer(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('storage_key', sa.String(length=500), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['course_instance_id'], ['course_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_course_selection_info_certificate_course_instance_id',
                    'course_selection_info_certificate', ['course_instance_id'], unique=True)

    # ### Add columns to course_instances ─────────────────────────────────
    op.add_column('course_instances',
        sa.Column('currencies_cert_seeded', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column('course_instances',
        sa.Column('currencies_certificate_completion', sa.Integer(), nullable=False, server_default='0')
    )


def downgrade() -> None:
    op.drop_column('course_instances', 'currencies_certificate_completion')
    op.drop_column('course_instances', 'currencies_cert_seeded')

    op.drop_index('ix_course_selection_info_certificate_course_instance_id', table_name='course_selection_info_certificate')
    op.drop_table('course_selection_info_certificate')

    op.drop_index('ix_cscs_currency_id', table_name='course_selection_info_currency_selected')
    op.drop_index('ix_cscs_instance_id', table_name='course_selection_info_currency_selected')
    op.drop_table('course_selection_info_currency_selected')
