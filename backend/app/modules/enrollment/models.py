import enum

from sqlalchemy import Enum, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import AuditedMixin, Base


class EnrollmentStatus(str, enum.Enum):
    ENROLLED = "enrolled"
    DROPPED = "dropped"
    COMPLETED = "completed"
    FAILED = "failed"


class Enrollment(AuditedMixin, Base):
    __tablename__ = "enrollments"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"))
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id"))
    status: Mapped[EnrollmentStatus] = mapped_column(
        Enum(EnrollmentStatus), default=EnrollmentStatus.ENROLLED
    )
    grade: Mapped[str | None] = mapped_column(String(5), nullable=True)
    grade_point: Mapped[float | None] = mapped_column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("student_id", "section_id", name="uq_student_section"),
    )

    # Cross-module string references
    # student: Mapped["Student"] = relationship(back_populates="enrollments")
    section: Mapped["Section"] = relationship(back_populates="enrollments")
