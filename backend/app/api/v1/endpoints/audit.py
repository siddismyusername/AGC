"""Audit API endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.responses import APIResponse, ResponseMeta, build_pagination
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.audit import AuditEventOut

router = APIRouter(prefix="/audit", tags=["Audit"])


def _meta() -> ResponseMeta:
    return ResponseMeta(request_id=str(uuid4()), timestamp=datetime.now(timezone.utc))


@router.get("/events")
async def list_audit_events(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * per_page

    base_query = (
        select(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(
            or_(
                User.organization_id == user.organization_id,
                AuditLog.user_id.is_(None),
            )
        )
        .order_by(AuditLog.created_at.desc())
    )

    result = await db.execute(base_query.offset(offset).limit(per_page))
    rows = result.all()

    count_query = (
        select(AuditLog.id)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(
            or_(
                User.organization_id == user.organization_id,
                AuditLog.user_id.is_(None),
            )
        )
    )
    total = len((await db.execute(count_query)).all())

    events = []
    for audit_log, event_user in rows:
        payload = AuditEventOut.model_validate(audit_log).model_dump()
        payload["user_email"] = event_user.email if event_user else None
        events.append(payload)

    return APIResponse(
        data=events,
        meta=_meta(),
        pagination=build_pagination(page, per_page, total),
    )
