"""material: drop materials hub, point folders/files at course_masters

Removes the 1:1 ``materials`` hub table. Its only real columns (``title`` and
``status``) were redundant — the title always mirrored ``course_masters.title``
and the binary status was already mirrored into
``course_masters.material_completion`` (100/0). ``material_folders`` and
``material_files`` now carry a ``course_master_id`` FK directly.

Mirrors ``d1r2e3c4t5t6_course_info_tabs_to_master.py`` (which dropped the
``course_infos`` hub the same way).

Revision ID: m2a3t4e5r6i7
Revises: f4c5i6t7c8p9
Create Date: 2026-06-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "m2a3t4e5r6i7"
down_revision: Union[str, None] = "f4c5i6t7c8p9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The two tables that hung off ``materials`` via ``material_id``. Each can have
# many rows per master (unlike the course_info tabs), so the new FK column is
# indexed but NOT unique.
_CHILD_TABLES: tuple[str, ...] = ("material_folders", "material_files")


def upgrade() -> None:
    for tbl in _CHILD_TABLES:
        # 1. Add the new FK column, nullable while we backfill.
        op.add_column(tbl, sa.Column("course_master_id", sa.Integer(), nullable=True))
        # 2. Backfill from the hub row each child currently points at.
        op.execute(
            f"UPDATE {tbl} AS t "
            f"SET course_master_id = m.course_master_id "
            f"FROM materials m "
            f"WHERE m.id = t.material_id"
        )
        # 3. Lock it down now that every row has a value.
        op.alter_column(tbl, "course_master_id", nullable=False)
        # 4. Drop the old column — Postgres cascades its FK and index automatically.
        op.drop_column(tbl, "material_id")
        # 5. Re-establish the link directly to the master (non-unique: many
        #    folders/files per master).
        op.create_index(
            f"ix_{tbl}_course_master_id", tbl, ["course_master_id"], unique=False
        )
        op.create_foreign_key(
            f"{tbl}_course_master_id_fkey",
            tbl,
            "course_masters",
            ["course_master_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # 6. The hub table is now unreferenced.
    op.drop_table("materials")


def downgrade() -> None:
    raise NotImplementedError(
        "Irreversible: the materials hub table was dropped. Restore from a "
        "pre-migration backup or recreate via the course_builder baseline."
    )
