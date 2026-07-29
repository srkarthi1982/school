"""Link profile modification request to request

Revision ID: p9r8o7f6m5r4
Revises: c94f691a1957
Create Date: 2026-06-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'p9r8o7f6m5r4'
down_revision: Union[str, None] = 'c94f691a1957'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'profile_mod_requests',
        sa.Column('request_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_profile_mod_requests_request_id',
        'profile_mod_requests',
        'requests',
        ['request_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_profile_mod_requests_request_id',
        'profile_mod_requests',
        type_='foreignkey',
    )
    op.drop_column('profile_mod_requests', 'request_id')
