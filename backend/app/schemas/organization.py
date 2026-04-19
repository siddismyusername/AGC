from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class OrganizationOut(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    members_count: int = 0
    projects_count: int = 0

    model_config = {"from_attributes": True}


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
