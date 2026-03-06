from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class ResponseMeta(BaseModel):
    request_id: str
    timestamp: datetime


class Pagination(BaseModel):
    page: int
    per_page: int
    total_items: int
    total_pages: int
    has_next: bool
    has_prev: bool


class ErrorDetail(BaseModel):
    field: Optional[str] = None
    message: str
    code: Optional[str] = None


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = []


class APIResponse(BaseModel):
    status: str = "success"
    data: Any = None
    meta: Optional[ResponseMeta] = None
    pagination: Optional[Pagination] = None


class APIErrorResponse(BaseModel):
    status: str = "error"
    error: ErrorBody
    meta: Optional[ResponseMeta] = None


def build_pagination(page: int, per_page: int, total: int) -> Pagination:
    total_pages = max(1, (total + per_page - 1) // per_page)
    return Pagination(
        page=page,
        per_page=per_page,
        total_items=total,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
    )
