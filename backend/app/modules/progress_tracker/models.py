from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin


class ProgressCourse(TimestampMixin, Base):
    __tablename__ = "pt_courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_name: Mapped[str] = mapped_column(String(255))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    course_id: Mapped[int | None] = mapped_column(ForeignKey("course_instances.id", ondelete="SET NULL"), nullable=True)
    color: Mapped[str] = mapped_column(String(32))


class ProgressQuizRecord(TimestampMixin, Base):
    __tablename__ = "pt_student_quizzes"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("course_instances.id", ondelete="SET NULL"), nullable=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total: Mapped[int] = mapped_column(Integer, default=100)
    date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(32))


class ProgressMaterialRecord(TimestampMixin, Base):
    __tablename__ = "pt_student_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("course_instances.id", ondelete="SET NULL"), nullable=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    material_type: Mapped[str] = mapped_column(String(32))
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    total_duration: Mapped[int | None] = mapped_column(Integer, nullable=True)
    watched_duration: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date_added: Mapped[date] = mapped_column(Date)
