from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class Department(TimestampMixin, Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    programs: Mapped[list["Program"]] = relationship(back_populates="department")
    courses: Mapped[list["Course"]] = relationship(back_populates="department")
    # Cross-module: Teacher lives in modules.profile
    # teachers: Mapped[list["Teacher"]] = relationship(back_populates="department")


class Program(TimestampMixin, Base):
    __tablename__ = "programs"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    degree_level: Mapped[str] = mapped_column(String(50))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    total_credits: Mapped[int] = mapped_column(Integer)

    department: Mapped["Department"] = relationship(back_populates="programs")
    # Cross-module: Student lives in modules.profile
    # students: Mapped[list["Student"]] = relationship(back_populates="program")


class Course(TimestampMixin, Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    credits: Mapped[int] = mapped_column(Integer)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))

    department: Mapped["Department"] = relationship(back_populates="courses")
