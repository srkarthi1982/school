"""schedule: drop course_schedules hub, point day rows at course_masters

Removes the 1:1 ``course_schedules`` hub table. Its only real column
(``status``) was redundant — only the binary "complete" bit was ever persisted
(mirrored into ``course_masters.schedule_completion`` 100/0), and the UI only
distinguishes complete vs not, so status is now derived from that column.
``course_schedule_days`` now carries a ``course_master_id`` FK directly;
``course_schedule_placements`` still hang off the day rows, unchanged.

Mirrors ``e1v2a3l4d5h6_drop_evaluations_hub.py`` (which dropped the
``evaluations`` hub the same way). No unique constraint to recreate here.

Revision ID: c8d9a0b1e2f3
Revises: e1v2a3l4d5h6
Create Date: 2026-06-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8d9a0b1e2f3"
down_revision: Union[str, None] = "e1v2a3l4d5h6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "course_schedule_days"


def upgrade() -> None:
    # 1. Add the new FK column, nullable while we backfill.
    op.add_column(_TABLE, sa.Column("course_master_id", sa.Integer(), nullable=True))
    # 2. Backfill from the hub row each day currently points at.
    op.execute(
        f"UPDATE {_TABLE} AS t "
        f"SET course_master_id = s.course_master_id "
        f"FROM course_schedules s "
        f"WHERE s.id = t.course_schedule_id"
    )
    # 3. Lock it down now that every row has a value.
    op.alter_column(_TABLE, "course_master_id", nullable=False)
    # 4. Drop the old column — Postgres cascades its FK and index automatically.
    op.drop_column(_TABLE, "course_schedule_id")
    # 5. Re-establish the link directly to the master (non-unique: many day
    #    rows per master).
    op.create_index(
        f"ix_{_TABLE}_course_master_id", _TABLE, ["course_master_id"], unique=False
    )
    op.create_foreign_key(
        f"{_TABLE}_course_master_id_fkey",
        _TABLE,
        "course_masters",
        ["course_master_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # 6. The hub table is now unreferenced.
    op.drop_table("course_schedules")


def downgrade() -> None:
    raise NotImplementedError(
        "Irreversible: the course_schedules hub table was dropped. Restore from "
        "a pre-migration backup or recreate via the course_builder baseline."
    )
