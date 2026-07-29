"""evaluation: drop evaluations hub, point lesson-quizzes at course_masters

Removes the 1:1 ``evaluations`` hub table. Its only real columns (``title`` and
``status``) were redundant — the title always mirrored ``course_masters.title``
and the binary status was already mirrored into
``course_masters.evaluation_completion`` (100/0). ``evaluation_lesson_quizzes``
now carries a ``course_master_id`` FK directly.

Mirrors ``f8b1d3e5a7c9_drop_form_builders_hub.py`` (which dropped the
``form_builders`` hub the same way), recreating the child's unique constraint on
``course_master_id``.

Revision ID: e1v2a3l4d5h6
Revises: f8b1d3e5a7c9
Create Date: 2026-06-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1v2a3l4d5h6"
down_revision: Union[str, None] = "f8b1d3e5a7c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "evaluation_lesson_quizzes"
_UQ_NAME = "uq_evaluation_lesson_quiz"


def upgrade() -> None:
    # 1. Add the new FK column, nullable while we backfill.
    op.add_column(_TABLE, sa.Column("course_master_id", sa.Integer(), nullable=True))
    # 2. Backfill from the hub row each child currently points at.
    op.execute(
        f"UPDATE {_TABLE} AS t "
        f"SET course_master_id = e.course_master_id "
        f"FROM evaluations e "
        f"WHERE e.id = t.evaluation_id"
    )
    # 3. Lock it down now that every row has a value.
    op.alter_column(_TABLE, "course_master_id", nullable=False)
    # 4. Drop the old column — Postgres cascades its FK, index and the unique
    #    constraint that referenced evaluation_id automatically.
    op.drop_column(_TABLE, "evaluation_id")
    # 5. Re-establish the link directly to the master (non-unique: many
    #    lesson-quiz associations per master).
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
    # 6. Recreate the unique constraint, now keyed on course_master_id.
    op.create_unique_constraint(
        _UQ_NAME, _TABLE, ["course_master_id", "lesson_id", "quiz_id"]
    )

    # 7. The hub table is now unreferenced.
    op.drop_table("evaluations")


def downgrade() -> None:
    raise NotImplementedError(
        "Irreversible: the evaluations hub table was dropped. Restore from a "
        "pre-migration backup or recreate via the course_builder baseline."
    )
