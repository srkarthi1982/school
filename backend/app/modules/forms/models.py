from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import AuditedMixin, Base


class DynamicForm(AuditedMixin, Base):
    __tablename__ = "dynamic_forms"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    course_name: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(255))
    form_metadata: Mapped[str | None] = mapped_column(Text)
    data: Mapped[str | None] = mapped_column(Text)
