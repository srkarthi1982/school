"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-04-14 00:00:00.000000

Single consolidated migration that creates the complete database schema for the
JAI School academic information system, including all tables, columns, indexes,
constraints, and audit infrastructure.

Main module groups:
  admin   — users (auth + user management), audit_logs
  common  — departments, programs, courses, academic_years, semesters,
            students, teachers
  teacher — sections, schedules, attendances
  student — enrollments
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # admin.users — User accounts and authentication
    # -------------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("ADMIN", "TEACHER", "STUDENT", "STAFF", name="role"),
            nullable=False,
        ),
        sa.Column(
            "auth_provider",
            sa.Enum("EMAIL", "LDAP", name="authprovider"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        # TimestampMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        # AuditedMixin
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL", name="fk_users_created_by_id"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL", name="fk_users_updated_by_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    # -------------------------------------------------------------------------
    # common.courses — Academic calendar: years and semesters
    # -------------------------------------------------------------------------
    op.create_table(
        "academic_years",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        # TimestampMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "semesters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "type",
            sa.Enum("FALL", "SPRING", "SUMMER", name="semestertype"),
            nullable=False,
        ),
        sa.Column("academic_year_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        # TimestampMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["academic_year_id"], ["academic_years.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # common.courses — Departments, Programs, Courses
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        # TimestampMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )

    op.create_table(
        "programs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("degree_level", sa.String(length=50), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=False),
        sa.Column("total_credits", sa.Integer(), nullable=False),
        # TimestampMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )

    op.create_table(
        "courses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("credits", sa.Integer(), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=False),
        # TimestampMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )

    # -------------------------------------------------------------------------
    # common.profile — Student and Teacher profiles
    # -------------------------------------------------------------------------
    op.create_table(
        "teachers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.String(length=20), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=False),
        sa.Column("specialization", sa.String(length=255), nullable=True),
        # TimestampMixin + AuditedMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL", name="fk_teachers_created_by_id"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL", name="fk_teachers_updated_by_id"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(op.f("ix_teachers_employee_id"), "teachers", ["employee_id"], unique=True)

    op.create_table(
        "students",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.String(length=20), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("program_id", sa.Integer(), nullable=False),
        sa.Column("enrollment_date", sa.Date(), nullable=False),
        sa.Column("current_semester", sa.Integer(), nullable=False),
        # TimestampMixin + AuditedMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL", name="fk_students_created_by_id"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL", name="fk_students_updated_by_id"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(op.f("ix_students_student_id"), "students", ["student_id"], unique=True)

    # -------------------------------------------------------------------------
    # teacher.schedule — Sections and Schedules
    # -------------------------------------------------------------------------
    op.create_table(
        "sections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("semester_id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("max_students", sa.Integer(), nullable=False),
        sa.Column("room", sa.String(length=50), nullable=True),
        # TimestampMixin + AuditedMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.ForeignKeyConstraint(["semester_id"], ["semesters.id"]),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"]),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL", name="fk_sections_created_by_id"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL", name="fk_sections_updated_by_id"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", "course_id", "semester_id", name="uq_section_course_semester"),
    )

    op.create_table(
        "schedules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column(
            "day_of_week",
            sa.Enum(
                "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
                name="dayofweek",
            ),
            nullable=False,
        ),
        sa.Column("start_time", sa.String(length=5), nullable=False),
        sa.Column("end_time", sa.String(length=5), nullable=False),
        # TimestampMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["section_id"], ["sections.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # -------------------------------------------------------------------------
    # teacher.attendance — Attendance records
    # -------------------------------------------------------------------------
    op.create_table(
        "attendances",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PRESENT", "ABSENT", "LATE", "EXCUSED", name="attendancestatus"),
            nullable=False,
        ),
        sa.Column("locked", sa.Boolean(), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        # TimestampMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["section_id"], ["sections.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "section_id", "date", name="uq_attendance_record"),
    )

    # -------------------------------------------------------------------------
    # student.grades — Enrollments and grades
    # -------------------------------------------------------------------------
    op.create_table(
        "enrollments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("ENROLLED", "DROPPED", "COMPLETED", "FAILED", name="enrollmentstatus"),
            nullable=False,
        ),
        sa.Column("grade", sa.String(length=5), nullable=True),
        sa.Column("grade_point", sa.Float(), nullable=True),
        # TimestampMixin + AuditedMixin
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["section_id"], ["sections.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL", name="fk_enrollments_created_by_id"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL", name="fk_enrollments_updated_by_id"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "section_id", name="uq_student_section"),
    )

    # -------------------------------------------------------------------------
    # admin.audit — Audit log (must follow users for FK)
    # -------------------------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("table_name", sa.String(length=100), nullable=False),
        sa.Column("row_id", sa.String(length=50), nullable=False),
        sa.Column("operation", sa.String(length=10), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "before_data",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.Column(
            "after_data",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.Column(
            "changed_fields",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_table_row", "audit_logs", ["table_name", "row_id"])
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"])


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_index("ix_audit_logs_timestamp", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_table_row", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_table("enrollments")
    op.drop_table("attendances")
    op.drop_table("schedules")
    op.drop_table("sections")

    op.drop_index(op.f("ix_students_student_id"), table_name="students")
    op.drop_table("students")
    op.drop_index(op.f("ix_teachers_employee_id"), table_name="teachers")
    op.drop_table("teachers")

    op.drop_table("courses")
    op.drop_table("programs")
    op.drop_table("departments")
    op.drop_table("semesters")
    op.drop_table("academic_years")

    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    # Drop enums
    sa.Enum(name="enrollmentstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="attendancestatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="dayofweek").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="semestertype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="authprovider").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="role").drop(op.get_bind(), checkfirst=True)
