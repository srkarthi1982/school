from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class FaqCreate(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1)


class FaqUpdate(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1)


class FaqResponse(BaseModel):
    id: int
    question: str
    answer: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


__all__ = ["FaqCreate", "FaqUpdate", "FaqResponse"]
