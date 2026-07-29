"""course builder: task associations + task_association_completion column

Revision ID: e5f6t7a8s9k0
Revises: d4f5l6i7g8h9
Create Date: 2026-06-24 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6t7a8s9k0'
down_revision: Union[str, None] = 'd4f5l6i7g8h9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### Task Association sub-tab completion on the master ────────────────
    op.add_column('course_masters',
        sa.Column('task_association_completion', sa.Integer(), nullable=False, server_default='0')
    )

    # ### master_course_task_associations ─────────────────────────────────
    op.create_table('master_course_task_associations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_master_id', sa.Integer(), nullable=False),
        sa.Column('task_master_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['course_master_id'], ['course_masters.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_master_id'], ['flight_task_master.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_master_course_task_associations_course_master_id', 'master_course_task_associations', ['course_master_id'])
    op.create_index('ix_master_course_task_associations_task_master_id', 'master_course_task_associations', ['task_master_id'])

    # ### master_course_task_association_eos ───────────────────────────────
    op.create_table('master_course_task_association_eos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('association_id', sa.Integer(), nullable=False),
        sa.Column('enabling_objective_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['association_id'], ['master_course_task_associations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['enabling_objective_id'], ['master_enabling_objectives.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_master_course_task_association_eos_association_id', 'master_course_task_association_eos', ['association_id'])
    op.create_index('ix_master_course_task_association_eos_enabling_objective_id', 'master_course_task_association_eos', ['enabling_objective_id'])

    # ### master_course_task_association_currencies ────────────────────────
    op.create_table('master_course_task_association_currencies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('association_id', sa.Integer(), nullable=False),
        sa.Column('currency_master_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['association_id'], ['master_course_task_associations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['currency_master_id'], ['currencies_master.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_master_course_task_association_currencies_association_id', 'master_course_task_association_currencies', ['association_id'])
    op.create_index('ix_master_course_task_association_currencies_currency_master_id', 'master_course_task_association_currencies', ['currency_master_id'])


def downgrade() -> None:
    op.drop_index('ix_master_course_task_association_currencies_currency_master_id', table_name='master_course_task_association_currencies')
    op.drop_index('ix_master_course_task_association_currencies_association_id', table_name='master_course_task_association_currencies')
    op.drop_table('master_course_task_association_currencies')

    op.drop_index('ix_master_course_task_association_eos_enabling_objective_id', table_name='master_course_task_association_eos')
    op.drop_index('ix_master_course_task_association_eos_association_id', table_name='master_course_task_association_eos')
    op.drop_table('master_course_task_association_eos')

    op.drop_index('ix_master_course_task_associations_task_master_id', table_name='master_course_task_associations')
    op.drop_index('ix_master_course_task_associations_course_master_id', table_name='master_course_task_associations')
    op.drop_table('master_course_task_associations')

    op.drop_column('course_masters', 'task_association_completion')
