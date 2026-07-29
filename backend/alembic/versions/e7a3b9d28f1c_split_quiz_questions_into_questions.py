"""split quiz_questions into questions and quiz_questions(link)

Revision ID: e7a3b9d28f1c
Revises: d4f9c5b1e3a2
Create Date: 2026-05-05 09:00:00.000000

Splits the existing ``quiz_questions`` table into two:

* ``questions``      — owns the question content (description, type,
                       difficulty, choices, answers, timestamps).
* ``quiz_questions`` — pure link table between a quiz and a question,
                       carrying ``weight`` and ``order_index``.

Existing rows are preserved: each ``quiz_questions`` row becomes one
``questions`` row using the *same* id, and ``quiz_questions.question_id``
is back-filled to that id.  The ``questions.id`` sequence is bumped past
the highest copied id so future inserts don't collide.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7a3b9d28f1c'
down_revision: Union[str, None] = 'c1d28e7f00ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. New questions table.
    op.create_table(
        'questions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('type', sa.String(length=32), nullable=False),
        sa.Column('difficulty', sa.String(length=16), nullable=False, server_default='medium'),
        sa.Column('choices', sa.JSON(), nullable=True),
        sa.Column('answers', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # 2. Copy content out of quiz_questions into questions, preserving id.
    op.execute(sa.text("""
        INSERT INTO questions (
            id, description, type, difficulty, choices, answers,
            created_at, updated_at
        )
        SELECT
            id, description, type, difficulty, choices, answers,
            created_at, updated_at
        FROM quiz_questions
    """))

    # 3. Bump the questions.id sequence past the highest copied id (Postgres).
    op.execute(sa.text("""
        SELECT setval(
            pg_get_serial_sequence('questions', 'id'),
            COALESCE((SELECT MAX(id) FROM questions), 0) + 1,
            false
        )
    """))

    # 4. Add question_id, back-fill it to the row's own id (1:1 mapping).
    op.add_column(
        'quiz_questions',
        sa.Column('question_id', sa.Integer(), nullable=True),
    )
    op.execute(sa.text("UPDATE quiz_questions SET question_id = id"))
    op.alter_column('quiz_questions', 'question_id', nullable=False)
    op.create_foreign_key(
        'fk_quiz_questions_question_id',
        'quiz_questions',
        'questions',
        ['question_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index(
        'ix_quiz_questions_question_id', 'quiz_questions', ['question_id']
    )

    # 5. Drop the columns now owned by questions.
    op.drop_column('quiz_questions', 'description')
    op.drop_column('quiz_questions', 'type')
    op.drop_column('quiz_questions', 'difficulty')
    op.drop_column('quiz_questions', 'choices')
    op.drop_column('quiz_questions', 'answers')


def downgrade() -> None:
    # 1. Re-add the content columns on quiz_questions (nullable for back-fill).
    op.add_column(
        'quiz_questions',
        sa.Column('description', sa.Text(), nullable=True),
    )
    op.add_column(
        'quiz_questions',
        sa.Column('type', sa.String(length=32), nullable=True),
    )
    op.add_column(
        'quiz_questions',
        sa.Column(
            'difficulty', sa.String(length=16),
            nullable=True, server_default='medium',
        ),
    )
    op.add_column(
        'quiz_questions',
        sa.Column('choices', sa.JSON(), nullable=True),
    )
    op.add_column(
        'quiz_questions',
        sa.Column('answers', sa.JSON(), nullable=True),
    )

    # 2. Copy content back from questions via question_id.
    op.execute(sa.text("""
        UPDATE quiz_questions AS qq
        SET description = q.description,
            type        = q.type,
            difficulty  = q.difficulty,
            choices     = q.choices,
            answers     = q.answers
        FROM questions AS q
        WHERE qq.question_id = q.id
    """))

    # 3. Tighten NOT NULLs to match the original schema.
    op.alter_column('quiz_questions', 'description', nullable=False)
    op.alter_column('quiz_questions', 'type', nullable=False)
    op.alter_column('quiz_questions', 'difficulty', nullable=False)
    op.alter_column('quiz_questions', 'answers', nullable=False)

    # 4. Drop the link column + its index/FK.
    op.drop_index('ix_quiz_questions_question_id', table_name='quiz_questions')
    op.drop_constraint(
        'fk_quiz_questions_question_id', 'quiz_questions', type_='foreignkey'
    )
    op.drop_column('quiz_questions', 'question_id')

    # 5. Drop the questions table.
    op.drop_table('questions')
