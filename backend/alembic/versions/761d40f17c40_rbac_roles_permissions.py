"""rbac_roles_permissions

Revision ID: 761d40f17c40
Revises: c842abfdda22
Create Date: 2026-04-24 10:35:17.733618

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '761d40f17c40'
down_revision: Union[str, None] = 'c842abfdda22'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Permission registry (self-contained for migration stability)
# ---------------------------------------------------------------------------
PERMISSIONS = [
    ("user:read", "Read Users", "View user accounts", "users"),
    ("user:write", "Write Users", "Create, update, deactivate user accounts", "users"),
    ("student:read", "Read Students", "View student profiles", "profiles"),
    ("student:write", "Write Students", "Create and update student profiles", "profiles"),
    ("teacher:read", "Read Teachers", "View teacher profiles", "profiles"),
    ("teacher:write", "Write Teachers", "Create and update teacher profiles", "profiles"),
    ("term:read", "Read Terms", "View academic years and semesters", "terms"),
    ("term:write", "Write Terms", "Create and update academic calendar", "terms"),
    ("course:read", "Read Courses", "View departments, programs, and courses", "courses"),
    ("course:write", "Write Courses", "Create and update departments, programs, and courses", "courses"),
    ("section:read", "Read Sections", "View sections and schedules", "sections"),
    ("section:write", "Write Sections", "Create and update sections and schedules", "sections"),
    ("enrollment:read", "Read Enrollments", "View enrollment records", "enrollments"),
    ("enrollment:write", "Write Enrollments", "Create and delete enrollments", "enrollments"),
    ("grade:write", "Write Grades", "Update enrollment grades", "enrollments"),
    ("attendance:read", "Read Attendance", "View attendance records", "attendance"),
    ("attendance:write", "Write Attendance", "Create and update attendance records", "attendance"),
    ("form:read", "Read Forms", "View dynamic forms", "forms"),
    ("form:write", "Write Forms", "Create and update dynamic forms", "forms"),
    ("form:delete", "Delete Forms", "Delete dynamic forms", "forms"),
    ("audit:read", "Read Audit Logs", "View system audit logs", "audit"),
    ("role:manage", "Manage Roles", "Create and assign roles and permissions", "rbac"),
    ("admin:full", "Full Admin", "Unrestricted system access", "admin"),
]

DEFAULT_ROLE_PERMISSIONS = {
    "student": [
        "course:read", "section:read", "term:read",
        "student:read", "teacher:read",
        "enrollment:read", "attendance:read", "form:read",
    ],
    "teacher": [
        "course:read", "section:read", "term:read",
        "student:read", "teacher:read",
        "enrollment:read", "grade:write",
        "attendance:read", "attendance:write", "form:read",
    ],
    "staff": [
        "user:read", "student:read", "student:write",
        "teacher:read", "teacher:write",
        "term:read", "term:write",
        "course:read", "course:write",
        "section:read", "section:write",
        "enrollment:read", "enrollment:write",
        "attendance:read", "attendance:write",
        "form:read", "form:write",
    ],
    "admin": [p[0] for p in PERMISSIONS],
}


def upgrade() -> None:
    conn = op.get_bind()

    # -----------------------------------------------------------------------
    # 1. Create roles table
    # -----------------------------------------------------------------------
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(op.f("ix_roles_name"), "roles", ["name"], unique=True)

    # -----------------------------------------------------------------------
    # 2. Create permissions table
    # -----------------------------------------------------------------------
    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("module", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_permissions_code"), "permissions", ["code"], unique=True)

    # -----------------------------------------------------------------------
    # 3. Create association tables
    # -----------------------------------------------------------------------
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
    )

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
    )

    # -----------------------------------------------------------------------
    # 4. Seed default roles
    # -----------------------------------------------------------------------
    roles_table = sa.table(
        "roles",
        sa.column("id", sa.Integer()),
        sa.column("name", sa.String()),
        sa.column("description", sa.String()),
        sa.column("is_system", sa.Boolean()),
    )
    op.bulk_insert(
        roles_table,
        [
            {"id": 1, "name": "admin", "description": "System administrator", "is_system": True},
            {"id": 2, "name": "teacher", "description": "Academic teacher", "is_system": True},
            {"id": 3, "name": "student", "description": "Enrolled student", "is_system": True},
            {"id": 4, "name": "staff", "description": "Administrative staff", "is_system": True},
        ],
    )

    # -----------------------------------------------------------------------
    # 5. Seed permissions
    # -----------------------------------------------------------------------
    permissions_table = sa.table(
        "permissions",
        sa.column("id", sa.Integer()),
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("description", sa.String()),
        sa.column("module", sa.String()),
    )
    perm_rows = [
        {"id": idx + 1, "code": code, "name": name, "description": desc, "module": mod}
        for idx, (code, name, desc, mod) in enumerate(PERMISSIONS)
    ]
    op.bulk_insert(permissions_table, perm_rows)

    # -----------------------------------------------------------------------
    # 6. Seed role-permission mappings
    # -----------------------------------------------------------------------
    role_permissions_table = sa.table(
        "role_permissions",
        sa.column("role_id", sa.Integer()),
        sa.column("permission_id", sa.Integer()),
    )
    role_perm_rows = []
    role_id_map = {"admin": 1, "teacher": 2, "student": 3, "staff": 4}
    perm_id_map = {p[0]: idx + 1 for idx, p in enumerate(PERMISSIONS)}
    for role_name, perm_codes in DEFAULT_ROLE_PERMISSIONS.items():
        rid = role_id_map[role_name]
        for code in perm_codes:
            pid = perm_id_map[code]
            role_perm_rows.append({"role_id": rid, "permission_id": pid})
    op.bulk_insert(role_permissions_table, role_perm_rows)

    # -----------------------------------------------------------------------
    # 7. Migrate existing user roles into user_roles
    # -----------------------------------------------------------------------
    user_roles_table = sa.table(
        "user_roles",
        sa.column("user_id", sa.Integer()),
        sa.column("role_id", sa.Integer()),
    )
    res = conn.execute(sa.text("SELECT id, role FROM users"))
    user_role_rows = []
    for row in res:
        user_id, role_val = row
        if role_val:
            normalized = role_val.lower()
            rid = role_id_map.get(normalized)
            if rid:
                user_role_rows.append({"user_id": user_id, "role_id": rid})

    if user_role_rows:
        op.bulk_insert(user_roles_table, user_role_rows)

    # -----------------------------------------------------------------------
    # 8. Reset PostgreSQL sequences after bulk inserts with explicit IDs
    # -----------------------------------------------------------------------
    op.execute(sa.text("SELECT setval('roles_id_seq', (SELECT MAX(id) FROM roles))"))
    op.execute(sa.text("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))"))

    # -----------------------------------------------------------------------
    # 9. Drop old role column and enum type
    # -----------------------------------------------------------------------
    op.drop_column("users", "role")
    op.execute(sa.text("DROP TYPE IF EXISTS role"))


def downgrade() -> None:
    # Re-create the old role enum
    op.execute(sa.text("CREATE TYPE role AS ENUM ('ADMIN', 'TEACHER', 'STUDENT', 'STAFF')"))

    # Add role column back
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.Enum("ADMIN", "TEACHER", "STUDENT", "STAFF", name="role"),
            nullable=False,
            server_default="STUDENT",
        ),
    )

    # Migrate roles back (best effort: use first role)
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            UPDATE users
            SET role = upper((
                SELECT r.name
                FROM roles r
                JOIN user_roles ur ON ur.role_id = r.id
                WHERE ur.user_id = users.id
                LIMIT 1
            ))
        """)
    )

    # Drop association tables
    op.drop_table("user_roles")
    op.drop_table("role_permissions")
    op.drop_table("permissions")
    op.drop_table("roles")
