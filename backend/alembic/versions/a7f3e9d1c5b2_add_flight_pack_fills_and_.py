"""add flight_pack_fills and flight_pack_grades tables

Revision ID: a7f3e9d1c5b2
Revises: f40b0b74bbbc
Create Date: 2026-06-30 15:48:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7f3e9d1c5b2'
down_revision: Union[str, None] = 'f40b0b74bbbc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # flight_pack_fills
    op.create_table(
        'flight_pack_fills',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('course_instance_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('pack_id', sa.Integer(), nullable=False),
        sa.Column('student_name', sa.String(length=255), server_default='', nullable=False),
        sa.Column('rank', sa.String(length=20), server_default='CIVILIAN', nullable=False),
        sa.Column('date', sa.String(length=10), server_default='', nullable=False),
        sa.Column('sortie_number', sa.String(length=50), server_default='', nullable=False),
        sa.Column('sortie_detail', sa.String(length=500), nullable=True),
        sa.Column('hour_day', sa.String(length=20), server_default='', nullable=False),
        sa.Column('hour_night', sa.String(length=20), server_default='', nullable=False),
        sa.Column('hour_nvg', sa.String(length=20), server_default='', nullable=False),
        sa.Column('hour_total', sa.String(length=20), server_default='', nullable=False),
        sa.Column('inst_simulated', sa.String(length=20), server_default='', nullable=False),
        sa.Column('inst_actual', sa.String(length=20), server_default='', nullable=False),
        sa.Column('inst_approaches', sa.String(length=20), server_default='', nullable=False),
        sa.Column('inst_ils', sa.String(length=20), server_default='', nullable=False),
        sa.Column('inst_vor', sa.String(length=20), server_default='', nullable=False),
        sa.Column('grade_sortie', sa.String(length=20), server_default='', nullable=False),
        sa.Column('grade_illum', sa.String(length=20), server_default='', nullable=False),
        sa.Column('grade_weather', sa.String(length=20), server_default='', nullable=False),
        sa.ForeignKeyConstraint(['course_instance_id'], ['course_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['pack_id'], ['course_selection_info_flight_package.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_instance_id', 'student_id', 'pack_id', name='uq_flight_pack_fill'),
    )
    op.create_index(op.f('ix_flight_pack_fills_course_instance_id'), 'flight_pack_fills', ['course_instance_id'], unique=False)
    op.create_index(op.f('ix_flight_pack_fills_pack_id'), 'flight_pack_fills', ['pack_id'], unique=False)
    op.create_index(op.f('ix_flight_pack_fills_student_id'), 'flight_pack_fills', ['student_id'], unique=False)

    # flight_pack_grades
    op.create_table(
        'flight_pack_grades',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('course_instance_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('pack_id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('satisfied', sa.Boolean(), nullable=True),
        sa.Column('score', sa.Integer(), nullable=True),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['course_instance_id'], ['course_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['pack_id'], ['course_selection_info_flight_package.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_id'], ['course_selection_info_flight_package_task.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_instance_id', 'student_id', 'pack_id', 'task_id', name='uq_flight_pack_grade'),
    )
    op.create_index(op.f('ix_flight_pack_grades_course_instance_id'), 'flight_pack_grades', ['course_instance_id'], unique=False)
    op.create_index(op.f('ix_flight_pack_grades_pack_id'), 'flight_pack_grades', ['pack_id'], unique=False)
    op.create_index(op.f('ix_flight_pack_grades_student_id'), 'flight_pack_grades', ['student_id'], unique=False)
    op.create_index(op.f('ix_flight_pack_grades_task_id'), 'flight_pack_grades', ['task_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_flight_pack_grades_task_id'), table_name='flight_pack_grades')
    op.drop_index(op.f('ix_flight_pack_grades_student_id'), table_name='flight_pack_grades')
    op.drop_index(op.f('ix_flight_pack_grades_pack_id'), table_name='flight_pack_grades')
    op.drop_index(op.f('ix_flight_pack_grades_course_instance_id'), table_name='flight_pack_grades')
    op.drop_table('flight_pack_grades')

    op.drop_index(op.f('ix_flight_pack_fills_student_id'), table_name='flight_pack_fills')
    op.drop_index(op.f('ix_flight_pack_fills_pack_id'), table_name='flight_pack_fills')
    op.drop_index(op.f('ix_flight_pack_fills_course_instance_id'), table_name='flight_pack_fills')
    op.drop_table('flight_pack_fills')
