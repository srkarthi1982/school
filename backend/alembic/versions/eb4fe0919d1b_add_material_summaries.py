"""add material_summaries table and deprecate library_material_summaries

Revision ID: eb4fe0919d1b
Revises: 6b756f5349bc
Create Date: 2026-07-02 11:42:28.380562

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'eb4fe0919d1b'
# down_revision: Union[str, None] = '6b756f5349bc' 
down_revision: Union[str, None] = '75a3b917a1bb' 
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Create the new material_summaries table
    op.create_table('material_summaries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('material_type', sa.String(length=20), nullable=False, server_default='library'),
        sa.Column('summary', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('narrative_text', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('narrative_voice', sa.String(), nullable=True),
        sa.Column('mindmap', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('summarize_ts', sa.DateTime(timezone=True), nullable=True),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['id'], ['library_materials.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('id'),
    )
    op.create_index(
        op.f('ix_material_summaries_material_type_material_id'),
        'material_summaries',
        ['material_type', 'id'],
        unique=False,
    )

    # 2. Copy data from old library_material_summaries table
    op.execute("""
        INSERT INTO material_summaries (
            id, material_type, summary, narrative_text, narrative_voice,
            mindmap, summarize_ts, version,
            created_by_id, created_at, updated_by_id, updated_at
        )
        SELECT id, 'library', summary, narrative_text, narrative_voice,
               mindmap, summarize_ts, version,
               created_by_id, created_at, updated_by_id, updated_at
        FROM library_material_summaries
    """)

    # 3. Drop triggers if any exist (created_by_id/updated_by_id auto-setters)
    op.execute("DROP TRIGGER IF EXISTS trg_library_material_summaries_insert ON library_material_summaries")
    op.execute("DROP TRIGGER IF EXISTS trg_library_material_summaries_update ON library_material_summaries")

    # 4. Drop old table and its index
    op.drop_index(op.f('ix_library_material_summaries_id'))
    op.drop_table('library_material_summaries')


def downgrade() -> None:
    # 1. Recreate old table
    op.create_table('library_material_summaries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('summary', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('narrative_text', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('narrative_voice', sa.String(), nullable=True),
        sa.Column('mindmap', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('summarize_ts', sa.DateTime(timezone=True), nullable=True),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['id'], ['library_materials.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_library_material_summaries_id'),
                    'library_material_summaries', ['id'], unique=True)

    # 2. Copy data back (from library-type rows only)
    op.execute("""
        INSERT INTO library_material_summaries (
            id, summary, narrative_text, narrative_voice, mindmap,
            summarize_ts, version,
            created_by_id, created_at, updated_by_id, updated_at
        )
        SELECT id, summary, narrative_text, narrative_voice, mindmap,
               summarize_ts, version,
               created_by_id, created_at, updated_by_id, updated_at
        FROM material_summaries
        WHERE material_type = 'library'
    """)

    # 3. Drop new table and its index
    op.drop_index(op.f('ix_material_summaries_material_type_material_id'))
    op.drop_table('material_summaries')

