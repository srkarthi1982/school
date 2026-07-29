"""Per-student lesson content release targeting

Turns ``course_selection_lesson_releases`` from a course-wide "released to all"
marker into a per-student targeting table: one row per student the content is
released to. Existing rows (released to the whole course) are expanded into one
row per currently-enrolled student so behaviour is preserved.

This revision also merges the outstanding migration heads back into one.

Revision ID: r7p8q9s0t1u2
Revises: 3d3c4cd07051, 75a3b917a1bb, c6d7e8f9a0b1, e2f9n7h3a8d1
Create Date: 2026-07-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "r7p8q9s0t1u2"
down_revision: Union[str, Sequence[str], None] = (
    "3d3c4cd07051",
    "75a3b917a1bb",
    "c6d7e8f9a0b1",
    "e2f9n7h3a8d1",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Add the new column nullable so existing rows survive the migration.
    op.add_column(
        "course_selection_lesson_releases",
        sa.Column("student_id", sa.Integer(), nullable=True),
    )

    # 2) Drop the old course-wide unique constraint FIRST — the expansion below
    #    inserts several rows sharing (course, lesson, type, content), which the
    #    old constraint (without student_id) would reject.
    op.drop_constraint(
        "uq_cs_lesson_release",
        "course_selection_lesson_releases",
        type_="unique",
    )

    # 3) Expand each existing course-wide release into one row per currently
    #    enrolled student, preserving the original release metadata. Distinct
    #    guards against duplicate enrolment rows (a student may have more than
    #    one enrolment_date).
    op.execute(
        """
        INSERT INTO course_selection_lesson_releases (
            course_instance_id, lesson_id, content_type, content_id,
            student_id, released_by, released_at, created_at, updated_at
        )
        SELECT DISTINCT
            r.course_instance_id, r.lesson_id, r.content_type, r.content_id,
            e.student_id, r.released_by, r.released_at, now(), now()
        FROM course_selection_lesson_releases r
        JOIN course_enrollments e
          ON e.course_instance_id = r.course_instance_id
        WHERE r.student_id IS NULL
        """
    )

    # 4) Drop the old course-wide rows (student_id still NULL) now that they are
    #    represented per-student.
    op.execute(
        "DELETE FROM course_selection_lesson_releases WHERE student_id IS NULL"
    )

    # 5) Make the column NOT NULL, add the FK + index, and add the new
    #    per-student unique constraint.
    op.alter_column(
        "course_selection_lesson_releases",
        "student_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.create_index(
        op.f("ix_course_selection_lesson_releases_student_id"),
        "course_selection_lesson_releases",
        ["student_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_cs_lesson_release_student",
        "course_selection_lesson_releases",
        "profiles",
        ["student_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_cs_lesson_release",
        "course_selection_lesson_releases",
        ["course_instance_id", "lesson_id", "content_type", "content_id", "student_id"],
    )


def downgrade() -> None:
    # Collapse per-student rows back to one course-wide row per content item.
    op.drop_constraint(
        "uq_cs_lesson_release",
        "course_selection_lesson_releases",
        type_="unique",
    )
    op.drop_constraint(
        "fk_cs_lesson_release_student",
        "course_selection_lesson_releases",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_course_selection_lesson_releases_student_id"),
        table_name="course_selection_lesson_releases",
    )

    # Keep one representative row per (course, lesson, content) and null its
    # student, then delete the rest.
    op.execute(
        """
        DELETE FROM course_selection_lesson_releases a
        USING course_selection_lesson_releases b
        WHERE a.course_instance_id = b.course_instance_id
          AND a.lesson_id = b.lesson_id
          AND a.content_type = b.content_type
          AND a.content_id = b.content_id
          AND a.id > b.id
        """
    )
    op.alter_column(
        "course_selection_lesson_releases",
        "student_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.execute(
        "UPDATE course_selection_lesson_releases SET student_id = NULL"
    )
    op.drop_column("course_selection_lesson_releases", "student_id")
    op.create_unique_constraint(
        "uq_cs_lesson_release",
        "course_selection_lesson_releases",
        ["course_instance_id", "lesson_id", "content_type", "content_id"],
    )
