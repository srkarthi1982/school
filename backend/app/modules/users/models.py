import enum

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import AuditedMixin, Base
from app.modules.profile.models import Profile


class AuthProvider(str, enum.Enum):
    EMAIL = "EMAIL"
    LDAP = "LDAP"


# ---------------------------------------------------------------------------
# Association tables
# ---------------------------------------------------------------------------
user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey(
        "users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey(
        "roles.id", ondelete="CASCADE"), primary_key=True),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey(
        "roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey(
        "permissions.id", ondelete="CASCADE"), primary_key=True),
)


# ---------------------------------------------------------------------------
# Role
# ---------------------------------------------------------------------------
class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    users: Mapped[list["User"]] = relationship(
        secondary=user_roles, back_populates="roles")
    permissions: Mapped[list["Permission"]] = relationship(
        secondary=role_permissions, back_populates="roles"
    )


# ---------------------------------------------------------------------------
# Permission
# ---------------------------------------------------------------------------
class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    module: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    roles: Mapped[list["Role"]] = relationship(
        secondary=role_permissions, back_populates="permissions"
    )


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(AuditedMixin, Base):
    __tablename__ = "users"
    __audit_exclude__ = frozenset({"hashed_password"})

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(
        String(255), nullable=True)
    auth_provider: Mapped[AuthProvider] = mapped_column(
        String(20), default=AuthProvider.EMAIL.value
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_external: Mapped[bool] = mapped_column(Boolean, default=False)

    roles: Mapped[list["Role"]] = relationship(
        secondary=user_roles, back_populates="users", lazy="selectin"
    )

    # Cross-module relationships — string references resolved lazily.
    # foreign_keys disambiguates from AuditedMixin's created_by_id / updated_by_id.
    student: Mapped["Student | None"] = relationship(
        back_populates="user", foreign_keys="Student.user_id"
    )
    teacher: Mapped["Teacher | None"] = relationship(
        back_populates="user", foreign_keys="Teacher.user_id"
    )
    # Attendance records for the user (student role)
    attendances: Mapped[list["Attendance"]] = relationship(
        "Attendance",
        back_populates="student",
        foreign_keys="Attendance.student_id",
        primaryjoin="User.id == Attendance.student_id"
    )
    profile: Mapped["Profile"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan", foreign_keys="Profile.user_id")

    @property
    def role_names(self) -> list[str]:
        """Convenience property returning role name strings."""
        return [r.name for r in self.roles]

    def has_role(self, *names: str) -> bool:
        return any(r.name in names for r in self.roles)

    @property
    def full_name(self) -> str:
        return self.profile.full_name if self.profile else None

    @full_name.setter
    def full_name(self, value: str):
        self.profile = self.profile or Profile()
        self.profile.full_name = value

    @property
    def email(self) -> str:
        return self.profile.email if self.profile else None

    @email.setter
    def email(self, value: str):
        self.profile = self.profile or Profile()
        self.profile.email = value
