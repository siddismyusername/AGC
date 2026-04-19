from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AuditEventOut(BaseModel):
    id: UUID
    action: str
    entity_type: str
    entity_id: UUID | None
    user_id: UUID | None
    user_email: str | None = None
    ip_address: str | None = None
    old_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
