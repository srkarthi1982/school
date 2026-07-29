"""course selection: point material/form/evaluation lesson links at the
instance's own Course Information lessons instead of the master's.

Each course instance now owns a cloned Course Information (incl. its own
Lesson Creation lessons). The Material, Form and Evaluation categories attach
their content to lessons, so their ``lesson_id`` foreign keys are re-targeted
from ``course_info_lesson_creation_lessons`` (master) to
``course_selection_info_lesson_creation_lessons`` (instance).

Revision ID: c5l6i7n8k9m0
Revises: 566c77962a20
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5l6i7n8k9m0"
down_revision: Union[str, None] = "566c77962a20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, foreign-key constraint name) — the constraints were created unnamed,
# so Postgres assigned the default ``{table}_{column}_fkey`` name.
_LESSON_FKS: tuple[tuple[str, str], ...] = (
    ("course_selection_material_folders", "course_selection_material_folders_lesson_id_fkey"),
    ("course_selection_material_files", "course_selection_material_files_lesson_id_fkey"),
    ("course_selection_form_survey_links", "course_selection_form_survey_links_lesson_id_fkey"),
    ("course_selection_form_form_links", "course_selection_form_form_links_lesson_id_fkey"),
    ("course_selection_evaluation_lesson_quizzes", "course_selection_evaluation_lesson_quizzes_lesson_id_fkey"),
    ("course_selection_evaluation_lesson_forms", "course_selection_evaluation_lesson_forms_lesson_id_fkey"),
)

_MASTER_LESSONS = "course_info_lesson_creation_lessons"
_INSTANCE_LESSONS = "course_selection_info_lesson_creation_lessons"


def upgrade() -> None:
    for table, fk in _LESSON_FKS:
        # Unlink any pre-existing rows that still reference a master lesson id
        # (seeded before this change) so the re-targeted FK cannot be violated.
        op.execute(
            f"UPDATE {table} SET lesson_id = NULL "
            f"WHERE lesson_id IS NOT NULL "
            f"AND lesson_id NOT IN (SELECT id FROM {_INSTANCE_LESSONS})"
        )
        op.drop_constraint(fk, table, type_="foreignkey")
        op.create_foreign_key(
            fk, table, _INSTANCE_LESSONS,
            ["lesson_id"], ["id"], ondelete="CASCADE",
        )


def downgrade() -> None:
    for table, fk in _LESSON_FKS:
        op.execute(
            f"UPDATE {table} SET lesson_id = NULL "
            f"WHERE lesson_id IS NOT NULL "
            f"AND lesson_id NOT IN (SELECT id FROM {_MASTER_LESSONS})"
        )
        op.drop_constraint(fk, table, type_="foreignkey")
        op.create_foreign_key(
            fk, table, _MASTER_LESSONS,
            ["lesson_id"], ["id"], ondelete="CASCADE",
        )
