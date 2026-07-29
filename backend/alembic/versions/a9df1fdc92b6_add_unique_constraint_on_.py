"""add unique constraint on LibraryMaterialUserProgress(user_id, material_id)

Revision ID: a9df1fdc92b6
Revises: 38c5f00aea4e
Create Date: 2026-07-08 07:28:48.131145

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a9df1fdc92b6'
down_revision: Union[str, None] = '38c5f00aea4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Deduplicate: keep the row with the highest id per (user_id, material_id),
    # delete the rest. Then add the unique constraint.
    op.execute("""
        DELETE FROM library_material_user_progress
        WHERE id NOT IN (
            SELECT sub.max_id FROM (
                SELECT MAX(id) AS max_id
                FROM library_material_user_progress
                GROUP BY user_id, material_id
            ) sub
        )
    """)

    op.create_unique_constraint(
        'uq_library_material_user_progress_user_material',
        'library_material_user_progress',
        ['user_id', 'material_id'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'uq_library_material_user_progress_user_material',
        'library_material_user_progress',
        type_='unique',
    )
