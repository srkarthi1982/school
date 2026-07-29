"""add master flight pack association tables and completion column

Revision ID: m1f2a3c4d5e6
Revises: f1a2b3c4d5e6
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'm1f2a3c4d5e6'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### course_masters: new completion column ──────────────────────────
    op.add_column('course_masters',
        sa.Column('flight_pack_association_completion',
                  sa.Integer(), nullable=False, server_default='0')
    )

    # ### master_course_flight_pack_association ─────────────────────────
    op.create_table(
        'master_course_flight_pack_associations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('course_master_id', sa.Integer(), nullable=False),
        sa.Column('package_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['course_master_id'],
                                ['course_masters.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['package_id'],
                                ['master_course_flight_packages.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_mcfpa_course_master_id',
        'master_course_flight_pack_associations',
        ['course_master_id'],
    )
    op.create_index(
        'ix_mcfpa_package_id',
        'master_course_flight_pack_associations',
        ['package_id'],
    )

    # ### master_course_flight_pack_association_lesson ──────────────────
    op.create_table(
        'master_course_flight_pack_association_lessons',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('association_id', sa.Integer(), nullable=False),
        sa.Column('lesson_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['association_id'],
                                ['master_course_flight_pack_associations.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['lesson_id'],
                                ['course_info_lesson_creation_lessons.id'],
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_mcfpa_lesson_association_id',
        'master_course_flight_pack_association_lessons',
        ['association_id'],
    )
    op.create_index(
        'ix_mcfpa_lesson_lesson_id',
        'master_course_flight_pack_association_lessons',
        ['lesson_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_mcfpa_lesson_lesson_id',
                  table_name='master_course_flight_pack_association_lessons')
    op.drop_index('ix_mcfpa_lesson_association_id',
                  table_name='master_course_flight_pack_association_lessons')
    op.drop_table('master_course_flight_pack_association_lessons')

    op.drop_index('ix_mcfpa_package_id',
                  table_name='master_course_flight_pack_associations')
    op.drop_index('ix_mcfpa_course_master_id',
                  table_name='master_course_flight_pack_associations')
    op.drop_table('master_course_flight_pack_associations')

    op.drop_column('course_masters', 'flight_pack_association_completion')
