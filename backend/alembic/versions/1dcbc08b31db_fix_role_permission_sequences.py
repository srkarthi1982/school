"""fix_role_permission_sequences

Revision ID: 1dcbc08b31db
Revises: 761d40f17c40
Create Date: 2026-04-25 09:16:02.046660

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1dcbc08b31db'
down_revision: Union[str, None] = '761d40f17c40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Reset PostgreSQL sequences after bulk inserts with explicit IDs
    # so that future auto-increment inserts do not collide.
    op.execute(sa.text("SELECT setval('roles_id_seq', (SELECT MAX(id) FROM roles))"))
    op.execute(sa.text("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))"))


def downgrade() -> None:
    # No safe downgrade for sequence resets; they are idempotent.
    pass
