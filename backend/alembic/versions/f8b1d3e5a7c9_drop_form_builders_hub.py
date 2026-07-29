"""form builder: drop form_builders hub, point links at course_masters

Removes the 1:1 ``form_builders`` hub table. Its only real columns (``title``
and ``status``) were redundant — the title always mirrored
``course_masters.title`` and the binary status was already mirrored into
``course_masters.surveys_completion`` (100/0, the legacy "surveys" column).
``form_builder_survey_links`` and ``form_builder_form_links`` now carry a
``course_master_id`` FK directly.

Mirrors ``m2a3t4e5r6i7_drop_materials_hub.py`` (which dropped the ``materials``
hub the same way), with the extra step of recreating each child's unique
constraint on ``course_master_id``.

Revision ID: f8b1d3e5a7c9
Revises: m2a3t4e5r6i7
Create Date: 2026-06-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f8b1d3e5a7c9"
down_revision: Union[str, None] = "m2a3t4e5r6i7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Each child table: (table, the other columns in its unique constraint, uq name).
_CHILD_TABLES: tuple[tuple[str, tuple[str, ...], str], ...] = (
    ("form_builder_survey_links", ("lesson_id", "survey_id"), "uq_form_builder_survey_link"),
    ("form_builder_form_links", ("lesson_id", "form_id"), "uq_form_builder_form_link"),
)


def upgrade() -> None:
    for tbl, extra_cols, uq_name in _CHILD_TABLES:
        # 1. Add the new FK column, nullable while we backfill.
        op.add_column(tbl, sa.Column("course_master_id", sa.Integer(), nullable=True))
        # 2. Backfill from the hub row each child currently points at.
        op.execute(
            f"UPDATE {tbl} AS t "
            f"SET course_master_id = fb.course_master_id "
            f"FROM form_builders fb "
            f"WHERE fb.id = t.form_builder_id"
        )
        # 3. Lock it down now that every row has a value.
        op.alter_column(tbl, "course_master_id", nullable=False)
        # 4. Drop the old column — Postgres cascades its FK, index and the
        #    unique constraint that referenced form_builder_id automatically.
        op.drop_column(tbl, "form_builder_id")
        # 5. Re-establish the link directly to the master (non-unique: many
        #    links per master).
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
        # 6. Recreate the unique constraint, now keyed on course_master_id.
        op.create_unique_constraint(uq_name, tbl, ["course_master_id", *extra_cols])

    # 7. The hub table is now unreferenced.
    op.drop_table("form_builders")


def downgrade() -> None:
    raise NotImplementedError(
        "Irreversible: the form_builders hub table was dropped. Restore from a "
        "pre-migration backup or recreate via the course_builder baseline."
    )
