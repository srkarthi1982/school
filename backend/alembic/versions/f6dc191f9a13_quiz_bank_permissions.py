"""add_quiz_permissions_and_role_permissions

Revision ID: f6dc191f9a13
Revises: 1dcbc08b31db
Create Date: 2026-05-01 09:03:02.046660

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.modules.users.models import Permission
from app.modules.users.models import role_permissions

# revision identifiers, used by Alembic.
revision: str = 'f6dc191f9a13'
down_revision: Union[str, None] = '1dcbc08b31db'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    permissions = sa.table(
        "permissions",
        sa.Column("id"),
        sa.Column("code"),
        sa.Column("name"),
        sa.Column("description"),
        sa.Column("module"),
        sa.Column("created_at"),
        sa.Column("updated_at"),
    )
    op.bulk_insert(permissions,
        [
            {"id":34, "code":'quiz:view', "name": "View Quiz", "description": 'View quiz', "module":'quiz', "created_at": '2026-05-01 09:15:35.181907+04', "updated_at":"2026-05-01 09:15:35.181907+04"},
            {"id":35, "code":'quiz:manage', "name": "Manage Quiz", "description": 'View, add, update, and delete quiz', "module":'quiz', "created_at": '2026-05-01 09:15:36.181907+04', "updated_at":"2026-05-01 09:15:36.181907+04"},
            {"id":36, "code":'quiz:approve', "name": "Approve Quiz", "description": 'Approve quiz', "module":'quiz', "created_at": '2026-05-01 09:15:37.181907+04', "updated_at":"2026-05-01 09:15:37.181907+04"},
            {"id":37, "code":'quiz:reject', "name": "Reject Quiz", "description": 'Reject quiz', "module":'quiz', "created_at": '2026-05-01 09:15:38.181907+04', "updated_at":"2026-05-01 09:15:38.181907+04"},
            {"id":38, "code":'quiz:take', "name": "Take Quiz", "description": 'Take quiz', "module":'quiz', "created_at": '2026-05-01 09:15:39.181907+04', "updated_at":"2026-05-01 09:15:39.181907+04"},
            {"id":39, "code":'question:view', "name": "View Question", "description": 'View question', "module":'quiz', "created_at": '2026-05-01 09:15:40.181907+04', "updated_at":"2026-05-01 09:15:40.181907+04"},
            {"id":40, "code":'question:manage', "name": "Manage Question", "description": 'View, add, update, and delete question', "module":'quiz', "created_at": '2026-05-01 09:15:41.181907+04', "updated_at":"2026-05-01 09:15:41.181907+04"}
        ]
    )

    role_permissions = sa.table("role_permissions", sa.Column("role_id"), sa.Column("permission_id"))
    op.bulk_insert(role_permissions, 
        [
            {"role_id":1, "permission_id":34},
            {"role_id":1, "permission_id":36},
            {"role_id":1, "permission_id":37},
            {"role_id":1, "permission_id":39},
            {"role_id":2, "permission_id":34},
            {"role_id":2, "permission_id":35},
            {"role_id":2, "permission_id":39},
            {"role_id":2, "permission_id":40},
            {"role_id":3, "permission_id":34},
            {"role_id":3, "permission_id":38},
            {"role_id":3, "permission_id":39}
        ]
    )

    # Reset sequence after bulk insert with explicit IDs to prevent
    # future auto-generated IDs from colliding with manually-assigned 34-40.
    op.execute(sa.text("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))"))

def downgrade() -> None:
    # No safe downgrade for sequence resets; they are idempotent.
    op.execute(sa.text("delete from role_permissions where role_id=1 and permission_id=34"))
    op.execute(sa.text("delete from role_permissions where role_id=1 and permission_id=36"))
    op.execute(sa.text("delete from role_permissions where role_id=1 and permission_id=37"))
    op.execute(sa.text("delete from role_permissions where role_id=1 and permission_id=39"))
    op.execute(sa.text("delete from role_permissions where role_id=2 and permission_id=34"))
    op.execute(sa.text("delete from role_permissions where role_id=2 and permission_id=35"))
    op.execute(sa.text("delete from role_permissions where role_id=2 and permission_id=39"))
    op.execute(sa.text("delete from role_permissions where role_id=2 and permission_id=40"))
    op.execute(sa.text("delete from role_permissions where role_id=3 and permission_id=34"))
    op.execute(sa.text("delete from role_permissions where role_id=3 and permission_id=38"))
    op.execute(sa.text("delete from role_permissions where role_id=3 and permission_id=39"))
    op.execute(sa.text("delete from permissions where id in (34,35,36,37,38,39,40)"))

    pass

# INSERT INTO "permissions" ("id", "code", "name", "description", "module", "created_at", "updated_at") VALUES
# 	(24, 'quiz:view', 'View Quiz', 'View quiz', 'quiz', '2026-05-01 09:15:35.181907+04', '2026-05-01 09:15:35.181907+04'),
# 	(25, 'quiz:manage', 'Manage Quiz', 'View, add, update, and delete quiz', 'quiz', '2026-05-01 09:15:36.181907+04', '2026-05-01 09:15:36.181907+04'),
# 	(26, 'quiz:approve', 'Approve Quiz', 'Approve quiz', 'quiz', '2026-05-01 09:15:37.181907+04', '2026-05-01 09:15:37.181907+04'),
# 	(27, 'quiz:reject', 'Reject Quiz', 'Reject quiz', 'quiz', '2026-05-01 09:15:38.181907+04', '2026-05-01 09:15:38.181907+04'),
# 	(28, 'quiz:take', 'Take Quiz', 'Take quiz', 'quiz', '2026-05-01 09:15:39.181907+04', '2026-05-01 09:15:39.181907+04'),
# 	(29, 'question:view', 'View Question', 'View question', 'quiz', '2026-05-01 09:15:40.181907+04', '2026-05-01 09:15:40.181907+04'),
# 	(30, 'question:manage', 'Manage Question', 'View, add, update, and delete question', 'quiz', '2026-05-01 09:15:41.181907+04', '2026-05-01 09:15:41.181907+04');
# INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES
# (1, 24),
# (1, 25),
# (1, 26),
# (1, 27),
# (1, 29),
# (1, 30),
# (2, 24),
# (2, 25),
# (2, 29),
# (2, 30),
# (3, 24),
# (3, 28),
# (3, 29)

# delete from permissions where id in (24,25,26,27,28,29,30)
# delete from role_permissions where role_id=1 and permission_id=24;
# delete from role_permissions where role_id=1 and permission_id=25;
# delete from role_permissions where role_id=1 and permission_id=26;
# delete from role_permissions where role_id=1 and permission_id=27;
# delete from role_permissions where role_id=1 and permission_id=29;
# delete from role_permissions where role_id=1 and permission_id=30;
# delete from role_permissions where role_id=2 and permission_id=24;
# delete from role_permissions where role_id=2 and permission_id=25;
# delete from role_permissions where role_id=2 and permission_id=29;
# delete from role_permissions where role_id=2 and permission_id=30;
# delete from role_permissions where role_id=3 and permission_id=24;
# delete from role_permissions where role_id=3 and permission_id=28;
# delete from role_permissions where role_id=3 and permission_id=29;
