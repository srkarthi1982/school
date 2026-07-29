"""add grading quiz survey form grades and progress tables

Revision ID: f40b0b74bbbc
Revises: 6ae2da7957a3
Create Date: 2026-06-30 08:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f40b0b74bbbc'
down_revision: Union[str, None] = '6ae2da7957a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # quiz_grades
    op.create_table(
        'quiz_grades',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('quiz_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('question_id', sa.Integer(), nullable=False),
        sa.Column('score', sa.Integer(), server_default='0', nullable=False),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['quiz_id'], ['quizzes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['question_id'], ['questions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('quiz_id', 'student_id', 'question_id', name='uq_quiz_grade'),
    )
    op.create_index(op.f('ix_quiz_grades_question_id'), 'quiz_grades', ['question_id'], unique=False)
    op.create_index(op.f('ix_quiz_grades_quiz_id'), 'quiz_grades', ['quiz_id'], unique=False)
    op.create_index(op.f('ix_quiz_grades_student_id'), 'quiz_grades', ['student_id'], unique=False)

    # grading_progress
    op.create_table(
        'grading_progress',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('grading_type', sa.String(length=16), nullable=False),
        sa.Column('graded_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_count', sa.Integer(), server_default='0', nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['course_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_id', 'student_id', 'grading_type', name='uq_grading_progress'),
    )
    op.create_index(op.f('ix_grading_progress_course_id'), 'grading_progress', ['course_id'], unique=False)
    op.create_index(op.f('ix_grading_progress_student_id'), 'grading_progress', ['student_id'], unique=False)

    # form_grades
    op.create_table(
        'form_grades',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('form_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('question_id', sa.Integer(), nullable=False),
        sa.Column('score', sa.Integer(), server_default='0', nullable=False),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['form_id'], ['forms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['question_id'], ['form_questions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('form_id', 'student_id', 'question_id', name='uq_form_grade'),
    )
    op.create_index(op.f('ix_form_grades_form_id'), 'form_grades', ['form_id'], unique=False)
    op.create_index(op.f('ix_form_grades_question_id'), 'form_grades', ['question_id'], unique=False)
    op.create_index(op.f('ix_form_grades_student_id'), 'form_grades', ['student_id'], unique=False)

    # survey_grades
    op.create_table(
        'survey_grades',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('survey_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('question_id', sa.Integer(), nullable=False),
        sa.Column('score', sa.Integer(), server_default='0', nullable=False),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['survey_id'], ['surveys.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['question_id'], ['survey_questions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('survey_id', 'student_id', 'question_id', name='uq_survey_grade'),
    )
    op.create_index(op.f('ix_survey_grades_question_id'), 'survey_grades', ['question_id'], unique=False)
    op.create_index(op.f('ix_survey_grades_student_id'), 'survey_grades', ['student_id'], unique=False)
    op.create_index(op.f('ix_survey_grades_survey_id'), 'survey_grades', ['survey_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_survey_grades_survey_id'), table_name='survey_grades')
    op.drop_index(op.f('ix_survey_grades_student_id'), table_name='survey_grades')
    op.drop_index(op.f('ix_survey_grades_question_id'), table_name='survey_grades')
    op.drop_table('survey_grades')

    op.drop_index(op.f('ix_form_grades_student_id'), table_name='form_grades')
    op.drop_index(op.f('ix_form_grades_question_id'), table_name='form_grades')
    op.drop_index(op.f('ix_form_grades_form_id'), table_name='form_grades')
    op.drop_table('form_grades')

    op.drop_index(op.f('ix_grading_progress_student_id'), table_name='grading_progress')
    op.drop_index(op.f('ix_grading_progress_course_id'), table_name='grading_progress')
    op.drop_table('grading_progress')

    op.drop_index(op.f('ix_quiz_grades_student_id'), table_name='quiz_grades')
    op.drop_index(op.f('ix_quiz_grades_quiz_id'), table_name='quiz_grades')
    op.drop_index(op.f('ix_quiz_grades_question_id'), table_name='quiz_grades')
    op.drop_table('quiz_grades')
