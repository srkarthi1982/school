"""quiz_bank tables

Revision ID: b3a17e2f9c01
Revises: f6dc191f9a13
Create Date: 2026-05-04 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3a17e2f9c01'
down_revision: Union[str, None] = 'f6dc191f9a13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'quizzes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=32), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('weight', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'quiz_questions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('quiz_id', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('type', sa.String(length=32), nullable=False),
        sa.Column('difficulty', sa.String(length=16), nullable=False, server_default='medium'),
        sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('choices', sa.JSON(), nullable=True),
        sa.Column('answers', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['quiz_id'], ['quizzes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_quiz_questions_quiz_id', 'quiz_questions', ['quiz_id'], unique=False
    )

    # Register quiz/question permissions (idempotent: only inserts missing codes).
    op.execute(sa.text("""
        INSERT INTO permissions (code, name, description, module, created_at, updated_at)
        SELECT code, name, description, module, NOW(), NOW()
        FROM (VALUES
            ('quiz:view', 'View Quiz', 'View quiz', 'quiz'),
            ('quiz:manage', 'Manage Quiz', 'View, add, update, and delete quiz', 'quiz'),
            ('quiz:approve', 'Approve Quiz', 'Approve quiz', 'quiz'),
            ('quiz:reject', 'Reject Quiz', 'Reject quiz', 'quiz'),
            ('quiz:take', 'Take Quiz', 'Take quiz', 'quiz'),
            ('question:view', 'View Question', 'View question', 'quiz'),
            ('question:manage', 'Manage Question', 'View, add, update, and delete question', 'quiz')
        ) AS new_perms(code, name, description, module)
        WHERE NOT EXISTS (
            SELECT 1 FROM permissions p WHERE p.code = new_perms.code
        )
    """))

    # Grant defaults: admin → all; teacher → view+manage for both; student → view + take.
    op.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
        WHERE p.code IN ('quiz:view','quiz:manage','quiz:approve','quiz:reject','quiz:take','question:view','question:manage')
          AND (
            (r.name = 'admin')
            OR (r.name = 'teacher' AND p.code IN ('quiz:view','quiz:manage','question:view','question:manage'))
            OR (r.name = 'student' AND p.code IN ('quiz:view','quiz:take','question:view'))
          )
          AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
          )
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions WHERE code IN
            ('quiz:view','quiz:manage','quiz:approve','quiz:reject','quiz:take','question:view','question:manage')
        )
    """))
    op.execute(sa.text("""
        DELETE FROM permissions WHERE code IN
        ('quiz:view','quiz:manage','quiz:approve','quiz:reject','quiz:take','question:view','question:manage')
    """))
    op.drop_index('ix_quiz_questions_quiz_id', table_name='quiz_questions')
    op.drop_table('quiz_questions')
    op.drop_table('quizzes')
