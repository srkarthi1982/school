"""add progress fields to library_materials

Revision ID: 3f9c2a1b7e4d
Revises: f6r7m8e9v0a1
Create Date: 2026-06-11 06:52:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "3f9c2a1b7e4d"
down_revision = "f6r7m8e9v0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add integer columns for reading progress with default 0
    op.add_column(
        "library_materials",
        sa.Column("pagesRead", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "library_materials",
        sa.Column("totalPages", sa.Integer(), nullable=False, server_default="0"),
    )
    # Add binary column for cover image (optional)
    op.add_column(
        "library_materials",
        sa.Column("coverimage", sa.LargeBinary(), nullable=True),
    )
    # Remove server defaults to keep model defaults clean
    op.alter_column("library_materials", "pagesRead", server_default=None)
    op.alter_column("library_materials", "totalPages", server_default=None)


def downgrade() -> None:
    op.drop_column("library_materials", "coverimage")
    op.drop_column("library_materials", "totalPages")
    op.drop_column("library_materials", "pagesRead")