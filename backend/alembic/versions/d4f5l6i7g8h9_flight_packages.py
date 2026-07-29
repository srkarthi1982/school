"""course builder: flight packages + flight_package_completion column

Revision ID: d4f5l6i7g8h9
Revises: c8s9t0u1v2w3
Create Date: 2026-06-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4f5l6i7g8h9'
down_revision: Union[str, None] = 'c8s9t0u1v2w3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### Flight Package sub-tab completion on the master ──────────────────
    op.add_column('course_masters',
        sa.Column('flight_package_completion', sa.Integer(), nullable=False, server_default='0')
    )

    # ### flight_task_master (shared catalog) ─────────────────────────────
    op.create_table('flight_task_master',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_no', sa.String(length=255), nullable=False),
        sa.Column('task_description', sa.Text(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_flight_task_master_task_no', 'flight_task_master', ['task_no'])

    # ### master_course_flight_packages ───────────────────────────────────
    op.create_table('master_course_flight_packages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_master_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False, server_default=''),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['course_master_id'], ['course_masters.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_master_course_flight_packages_course_master_id', 'master_course_flight_packages', ['course_master_id'])

    # ### master_course_flight_package_tasks ──────────────────────────────
    op.create_table('master_course_flight_package_tasks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('package_id', sa.Integer(), nullable=False),
        sa.Column('task_master_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['package_id'], ['master_course_flight_packages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_master_id'], ['flight_task_master.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_master_course_flight_package_tasks_package_id', 'master_course_flight_package_tasks', ['package_id'])
    op.create_index('ix_master_course_flight_package_tasks_task_master_id', 'master_course_flight_package_tasks', ['task_master_id'])


def downgrade() -> None:
    op.drop_index('ix_master_course_flight_package_tasks_task_master_id', table_name='master_course_flight_package_tasks')
    op.drop_index('ix_master_course_flight_package_tasks_package_id', table_name='master_course_flight_package_tasks')
    op.drop_table('master_course_flight_package_tasks')

    op.drop_index('ix_master_course_flight_packages_course_master_id', table_name='master_course_flight_packages')
    op.drop_table('master_course_flight_packages')

    op.drop_index('ix_flight_task_master_task_no', table_name='flight_task_master')
    op.drop_table('flight_task_master')

    op.drop_column('course_masters', 'flight_package_completion')
