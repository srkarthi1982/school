from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column

from app.core.database import Base, TimestampMixin


class AttendanceStatus(Base, TimestampMixin):
    __tablename__ = "attendance_status"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, nullable=False)
    code: Mapped[str] = mapped_column(String(length=50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(length=255), nullable=False)
    color: Mapped[str | None] = mapped_column(String(length=50), nullable=True)

    created_by_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_by_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("code", name="uq_attendance_status_code"),
    )

    # Relationships (optional, can be expanded later)
    # created_by = relationship("User", foreign_keys=[created_by_id], backref="created_statuses")
    # updated_by = relationship("User", foreign_keys=[updated_by_id], backref="updated_statuses")
    # Add reverse relationship to Attendance
    attendances: Mapped[list["Attendance"]] = relationship(
        "Attendance", back_populates="status"
    )