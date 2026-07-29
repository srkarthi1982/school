"""course info: drop course_infos hub, point tab tables at course_masters

Removes the 1:1 ``course_infos`` hub table. Its only real columns
(``course_title`` and ``status``) were redundant — the title always mirrored
``course_masters.title`` and the status was never read. The 5 typed tab tables
now carry a unique ``course_master_id`` FK directly.

Revision ID: d1r2e3c4t5t6
Revises: 1e821e1403fb
Create Date: 2026-06-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d1r2e3c4t5t6"
down_revision: Union[str, None] = "1e821e1403fb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The 5 per-tab typed tables that hung off ``course_infos`` via ``course_info_id``.
_TAB_TABLES: tuple[str, ...] = (
    "course_info_general",
    "course_info_personnel_requirement",
    "course_info_resources",
    "course_info_lesson_planning",
    "course_info_lesson_creation",
)


def upgrade() -> None:
    for tab in _TAB_TABLES:
        # 1. Add the new FK column, nullable while we backfill.
        op.add_column(tab, sa.Column("course_master_id", sa.Integer(), nullable=True))
        # 2. Backfill from the hub row each tab currently points at.
        op.execute(
            f"UPDATE {tab} AS t "
            f"SET course_master_id = ci.course_master_id "
            f"FROM course_infos ci "
            f"WHERE ci.id = t.course_info_id"
        )
        # 3. Lock it down now that every row has a value.
        op.alter_column(tab, "course_master_id", nullable=False)
        # 4. Drop the old column — Postgres cascades its FK, unique constraint
        #    and index automatically.
        op.drop_column(tab, "course_info_id")
        # 5. Re-establish the 1:1 link directly to the master. The model declares
        #    ``unique=True, index=True`` which SQLAlchemy maps to a single unique
        #    index (not a separate UNIQUE constraint).
        op.create_index(
            f"ix_{tab}_course_master_id", tab, ["course_master_id"], unique=True
        )
        op.create_foreign_key(
            f"{tab}_course_master_id_fkey",
            tab,
            "course_masters",
            ["course_master_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # 6. The hub table is now unreferenced.
    op.drop_table("course_infos")


def downgrade() -> None:
    raise NotImplementedError(
        "Irreversible: the course_infos hub table was dropped. Restore from a "
        "pre-migration backup or recreate via the course_builder baseline."
    )
