from datetime import datetime
from pydantic import BaseModel

from app.core.schemas import AuditedResponse


class DynamicFormCreate(BaseModel):
    title: str
    course_name: str | None = None
    description: str | None = None
    form_metadata: str | None = None
    data: str | None = None


class DynamicFormUpdate(BaseModel):
    version: int
    title: str | None = None
    course_name: str | None = None
    description: str | None = None
    form_metadata: str | None = None
    data: str | None = None


class DynamicFormSummary(BaseModel):
    id: int
    title: str
    course_name: str | None
    description: str | None


class DynamicFormNoCourseResponse(BaseModel):
    id: int
    title: str
    course_name: str | None
    description: str | None
    version: int
    created_by_id: int | None
    updated_by_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DynamicFormResponse(AuditedResponse):
    id: int
    title: str
    course_name: str | None
    description: str | None
    form_metadata: str | None
    data: str | None

    model_config = {"from_attributes": True}
