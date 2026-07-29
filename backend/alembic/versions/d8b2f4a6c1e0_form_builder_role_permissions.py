"""grant form_builder permissions to roles

Inserts the ``form_builder:read/write/delete`` permission rows (idempotent) and
grants each to every role that already holds the matching ``evaluation:*``
permission. This mirrors how the Form Builder category parallels Evaluation, so
teachers/staff/admins who can manage Evaluation can also manage Form Builder.
Code-based subqueries keep it robust against environment-specific permission ids.

Revision ID: d8b2f4a6c1e0
Revises: c5e1a7d9f2b4
Create Date: 2026-06-08 10:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d8b2f4a6c1e0"
down_revision: Union[str, Sequence[str], None] = "c5e1a7d9f2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_PERMISSIONS = [
    (
        "form_builder:read",
        "Read Form Builder",
        "View Course Builder Form Builder survey/form associations",
    ),
    (
        "form_builder:write",
        "Write Form Builder",
        "Associate surveys and forms with lessons or the course and manage Form Builder completion",
    ),
    (
        "form_builder:delete",
        "Delete Form Builder",
        "Remove survey/form associations from Course Builder Form Builder",
    ),
]

# form_builder:X is granted to every role holding evaluation:X.
_GRANT_FROM = {
    "form_builder:read": "evaluation:read",
    "form_builder:write": "evaluation:write",
    "form_builder:delete": "evaluation:delete",
}


def upgrade() -> None:
    for code, name, description in _PERMISSIONS:
        op.execute(
            sa.text(
                """
                INSERT INTO permissions (code, name, description, module, created_at, updated_at)
                SELECT :code, :name, :description, 'form_builder', now(), now()
                WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.code = :code)
                """
            ).bindparams(code=code, name=name, description=description)
        )

    for form_code, eval_code in _GRANT_FROM.items():
        op.execute(
            sa.text(
                """
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT rp.role_id, fp.id
                FROM role_permissions rp
                JOIN permissions ep ON ep.id = rp.permission_id AND ep.code = :eval_code
                JOIN permissions fp ON fp.code = :form_code
                WHERE NOT EXISTS (
                    SELECT 1 FROM role_permissions x
                    WHERE x.role_id = rp.role_id AND x.permission_id = fp.id
                )
                """
            ).bindparams(eval_code=eval_code, form_code=form_code)
        )

    # Reset the sequence so future auto-generated ids don't collide.
    op.execute(
        sa.text(
            "SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))"
        )
    )


def downgrade() -> None:
    codes = [c for c, _, _ in _PERMISSIONS]
    op.execute(
        sa.text(
            """
            DELETE FROM role_permissions
            WHERE permission_id IN (SELECT id FROM permissions WHERE code = ANY(:codes))
            """
        ).bindparams(codes=codes)
    )
    op.execute(
        sa.text("DELETE FROM permissions WHERE code = ANY(:codes)").bindparams(
            codes=codes
        )
    )
