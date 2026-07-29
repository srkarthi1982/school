import math
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import asc, desc
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Query

from app.core.response import Meta, SuccessResponse


class TimestampedResponse(BaseModel):
    """Base for responses from models using TimestampMixin."""

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AuditedResponse(TimestampedResponse):
    """Base for responses from models using AuditedMixin."""

    version: int
    created_by_id: int | None
    updated_by_id: int | None


def apply_sort(query: Query, model, sort_by: str | None, sort_order: str) -> Query:
    if sort_by:
        mapper = sa_inspect(model)
        col_names = {c.key for c in mapper.columns}
        if sort_by in col_names:
            col = getattr(model, sort_by)
            query = query.order_by(asc(col) if sort_order == "asc" else desc(col))
    return query


def paginate(query: Query, page: int, page_size: int) -> SuccessResponse:
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    pages = max(1, math.ceil(total / page_size))
    return SuccessResponse(
        data=items,
        meta=Meta(page=page, page_size=page_size, total=total, pages=pages),
    )
