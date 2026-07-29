"""course selection: own flight package + task association tables

Revision ID: f6s7e8l9c0a1
Revises: e5f6t7a8s9k0
Create Date: 2026-06-24 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6s7e8l9c0a1'
down_revision: Union[str, None] = 'e5f6t7a8s9k0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### Add seed + completion columns to course_instances ───────────────
    op.add_column('course_instances',
        sa.Column('flight_package_seeded', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column('course_instances',
        sa.Column('task_association_seeded', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column('course_instances',
        sa.Column('flight_package_completion', sa.Integer(), nullable=False, server_default='0')
    )
    op.add_column('course_instances',
        sa.Column('task_association_completion', sa.Integer(), nullable=False, server_default='0')
    )

    # ### course_selection_info_flight_package ────────────────────────────
    op.create_table('course_selection_info_flight_package',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_instance_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False, server_default=''),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['course_instance_id'], ['course_instances.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_csifp_instance_id', 'course_selection_info_flight_package', ['course_instance_id'])

    # ### course_selection_info_flight_package_task ───────────────────────
    op.create_table('course_selection_info_flight_package_task',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('package_id', sa.Integer(), nullable=False),
        sa.Column('task_master_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['package_id'], ['course_selection_info_flight_package.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_master_id'], ['flight_task_master.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_csifpt_package_id', 'course_selection_info_flight_package_task', ['package_id'])
    op.create_index('ix_csifpt_task_master_id', 'course_selection_info_flight_package_task', ['task_master_id'])

    # ### course_selection_info_task_association ──────────────────────────
    op.create_table('course_selection_info_task_association',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_instance_id', sa.Integer(), nullable=False),
        sa.Column('task_master_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['course_instance_id'], ['course_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_master_id'], ['flight_task_master.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_csita_instance_id', 'course_selection_info_task_association', ['course_instance_id'])
    op.create_index('ix_csita_task_master_id', 'course_selection_info_task_association', ['task_master_id'])

    # ### course_selection_info_task_association_eo ───────────────────────
    op.create_table('course_selection_info_task_association_eo',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('association_id', sa.Integer(), nullable=False),
        sa.Column('enabling_objective_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['association_id'], ['course_selection_info_task_association.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['enabling_objective_id'], ['master_enabling_objectives.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_csita_eo_association_id', 'course_selection_info_task_association_eo', ['association_id'])
    op.create_index('ix_csita_eo_enabling_objective_id', 'course_selection_info_task_association_eo', ['enabling_objective_id'])

    # ### course_selection_info_task_association_currency ─────────────────
    op.create_table('course_selection_info_task_association_currency',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('association_id', sa.Integer(), nullable=False),
        sa.Column('currency_master_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['association_id'], ['course_selection_info_task_association.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['currency_master_id'], ['currencies_master.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_csita_cur_association_id', 'course_selection_info_task_association_currency', ['association_id'])
    op.create_index('ix_csita_cur_currency_master_id', 'course_selection_info_task_association_currency', ['currency_master_id'])


def downgrade() -> None:
    op.drop_index('ix_csita_cur_currency_master_id', table_name='course_selection_info_task_association_currency')
    op.drop_index('ix_csita_cur_association_id', table_name='course_selection_info_task_association_currency')
    op.drop_table('course_selection_info_task_association_currency')

    op.drop_index('ix_csita_eo_enabling_objective_id', table_name='course_selection_info_task_association_eo')
    op.drop_index('ix_csita_eo_association_id', table_name='course_selection_info_task_association_eo')
    op.drop_table('course_selection_info_task_association_eo')

    op.drop_index('ix_csita_task_master_id', table_name='course_selection_info_task_association')
    op.drop_index('ix_csita_instance_id', table_name='course_selection_info_task_association')
    op.drop_table('course_selection_info_task_association')

    op.drop_index('ix_csifpt_task_master_id', table_name='course_selection_info_flight_package_task')
    op.drop_index('ix_csifpt_package_id', table_name='course_selection_info_flight_package_task')
    op.drop_table('course_selection_info_flight_package_task')

    op.drop_index('ix_csifp_instance_id', table_name='course_selection_info_flight_package')
    op.drop_table('course_selection_info_flight_package')

    op.drop_column('course_instances', 'task_association_completion')
    op.drop_column('course_instances', 'flight_package_completion')
    op.drop_column('course_instances', 'task_association_seeded')
    op.drop_column('course_instances', 'flight_package_seeded')
