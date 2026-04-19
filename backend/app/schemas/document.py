from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DocumentOut(BaseModel):
    id: UUID
    project_id: UUID
    file_name: str
    file_type: str
    description: Optional[str]
    file_size_bytes: int
    content_type: str
    storage_key: str
    processing_status: str
    extracted_data: dict | None = None
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListQuery(BaseModel):
    file_type: Optional[str] = Field(default=None, pattern="^(text|diagram|pdf|markdown)$")
    processing_status: Optional[str] = Field(default=None, pattern="^(pending|processing|completed|failed)$")


class DocumentStatusUpdateRequest(BaseModel):
    new_status: str = Field(..., pattern="^(pending|processing|completed|failed)$")


class DocumentExtractedDataUpdateRequest(BaseModel):
    extracted_data: dict


class DocumentProcessingRequest(BaseModel):
    mode: Literal["inline", "background"] = "inline"
    force: bool = False


class DocumentDeadLetterReplayRequest(BaseModel):
    allow_non_retryable: bool = False