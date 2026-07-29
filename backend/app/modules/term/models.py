import enum
from datetime import date

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class SemesterType(str, enum.Enum):
    FALL = "fall"
    SPRING = "spring"
    SUMMER = "summer"


class AcademicYear(TimestampMixin, Base):
    __tablename__ = "academic_years"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)

    semesters: Mapped[list["Semester"]] = relationship(back_populates="academic_year")


class Semester(TimestampMixin, Base):
    __tablename__ = "semesters"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[SemesterType] = mapped_column()
    academic_year_id: Mapped[int] = mapped_column(ForeignKey("academic_years.id"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)

    academic_year: Mapped["AcademicYear"] = relationship(back_populates="semesters")
    # Cross-module: Section lives in modules.section
    sections: Mapped[list["Section"]] = relationship(back_populates="semester")
