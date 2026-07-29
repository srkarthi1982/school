"""add flight pack association tables and course_instances completion column

Revision ID: f1a2b3c4d5e6
Revises: e8b1c2d3f4a5
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e8b1c2d3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### course_instances: new seeded + completion columns for FPA ────
    op.add_column('course_instances',
        sa.Column('flight_pack_association_seeded',
                  sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column('course_instances',
        sa.Column('flight_pack_association_completion',
                  sa.Integer(), nullable=False, server_default='0')
    )

    # ### course_selection_info_flight_pack_association ──────────────────
    op.create_table(
        'course_selection_info_flight_pack_association',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('course_instance_id', sa.Integer(), nullable=False),
        sa.Column('package_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['course_instance_id'],
                                ['course_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['package_id'],
                                ['course_selection_info_flight_package.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_csifpa_instance_id',
        'course_selection_info_flight_pack_association',
        ['course_instance_id'],
    )
    op.create_index(
        'ix_csifpa_package_id',
        'course_selection_info_flight_pack_association',
        ['package_id'],
    )

    # ### course_selection_info_flight_pack_association_lesson ───────────
    op.create_table(
        'course_selection_info_flight_pack_association_lesson',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('association_id', sa.Integer(), nullable=False),
        sa.Column('lesson_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['association_id'],
                                ['course_selection_info_flight_pack_association.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['lesson_id'],
                                ['course_selection_info_lesson_creation_lessons.id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_csifpa_lesson_association_id',
        'course_selection_info_flight_pack_association_lesson',
        ['association_id'],
    )
    op.create_index(
        'ix_csifpa_lesson_lesson_id',
        'course_selection_info_flight_pack_association_lesson',
        ['lesson_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_csifpa_lesson_lesson_id',
                  table_name='course_selection_info_flight_pack_association_lesson')
    op.drop_index('ix_csifpa_lesson_association_id',
                  table_name='course_selection_info_flight_pack_association_lesson')
    op.drop_table('course_selection_info_flight_pack_association_lesson')

    op.drop_index('ix_csifpa_instance_id',
                  table_name='course_selection_info_flight_pack_association')
    op.drop_table('course_selection_info_flight_pack_association')

    op.drop_column('course_instances', 'flight_pack_association_completion')
    op.drop_column('course_instances', 'flight_pack_association_seeded')
