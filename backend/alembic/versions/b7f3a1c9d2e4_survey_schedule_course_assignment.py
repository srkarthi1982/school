"""survey schedule, course link, assignment and per-question time

Revision ID: b7f3a1c9d2e4
Revises: 282e9c8f1780
Create Date: 2026-06-06 05:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7f3a1c9d2e4'
down_revision: Union[str, None] = '282e9c8f1780'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('surveys', sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('surveys', sa.Column('course_id', sa.Integer(), nullable=True))
    op.add_column(
        'surveys',
        sa.Column(
            'assignment_type',
            sa.String(length=32),
            server_default=sa.text("'general'"),
            nullable=False,
        ),
    )
    op.add_column('surveys', sa.Column('assignee_id', sa.Text(), nullable=True))
    op.create_index(op.f('ix_surveys_course_id'), 'surveys', ['course_id'], unique=False)
    op.create_foreign_key(
        'fk_surveys_course_id_courses',
        'surveys',
        'courses',
        ['course_id'],
        ['id'],
        ondelete='SET NULL',
    )

    op.add_column('survey_student_responses', sa.Column('question_times', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('survey_student_responses', 'question_times')

    op.drop_constraint('fk_surveys_course_id_courses', 'surveys', type_='foreignkey')
    op.drop_index(op.f('ix_surveys_course_id'), table_name='surveys')
    op.drop_column('surveys', 'assignee_id')
    op.drop_column('surveys', 'assignment_type')
    op.drop_column('surveys', 'course_id')
    op.drop_column('surveys', 'scheduled_at')
