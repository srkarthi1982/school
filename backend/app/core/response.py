from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Meta(BaseModel):
    page: int
    page_size: int
    total: int
    pages: int


class SuccessResponse(BaseModel, Generic[T]):
    success: bool = True
    data: T
    meta: Meta | None = None


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: list[Any] = []


class ApiResponse(BaseModel):
    success: bool


class ApiErrorResponse(ApiResponse):
    success: bool = False
    error: ErrorDetail


def ok(data: T, meta: Meta | None = None) -> SuccessResponse[T]:
    return SuccessResponse(data=data, meta=meta)
