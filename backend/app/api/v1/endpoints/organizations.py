"""Organization API endpoints."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.responses import APIResponse, ResponseMeta
from app.models.organization import Organization
from app.models.project import Project
from app.models.user import User
from app.schemas.organization import OrganizationMemberOut, OrganizationOut, OrganizationUpdate

router = APIRouter(prefix="/organizations", tags=["Organizations"])


def _meta() -> ResponseMeta:
    return ResponseMeta(request_id=str(uuid4()), timestamp=datetime.now(timezone.utc))


def _slugify(name: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", name.lower().strip())
    return re.sub(r"[-\s]+", "-", slug)


@router.get("/me")
async def get_my_organization(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = (
        await db.execute(select(Organization).where(Organization.id == user.organization_id))
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Organization not found"})

    members_count = (
        await db.execute(select(func.count()).select_from(User).where(User.organization_id == org.id))
    ).scalar() or 0
    projects_count = (
        await db.execute(select(func.count()).select_from(Project).where(Project.organization_id == org.id, Project.is_active == True))
    ).scalar() or 0

    payload = OrganizationOut.model_validate(org).model_dump()
    payload["members_count"] = int(members_count)
    payload["projects_count"] = int(projects_count)

    return APIResponse(data=payload, meta=_meta())


@router.patch("/me")
async def update_my_organization(
    body: OrganizationUpdate,
    user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    org = (
        await db.execute(select(Organization).where(Organization.id == user.organization_id))
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Organization not found"})

    updates = body.model_dump(exclude_unset=True)

    if "name" in updates and updates["name"]:
        new_slug = _slugify(updates["name"])
        slug_owner = (
            await db.execute(
                select(Organization).where(Organization.slug == new_slug, Organization.id != org.id)
            )
        ).scalar_one_or_none()
        if slug_owner:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail={"code": "CONFLICT", "message": "Organization name is already in use"},
            )
        org.name = updates["name"]
        org.slug = new_slug

    if "description" in updates:
        org.description = updates["description"]

    org.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(org)

    payload = OrganizationOut.model_validate(org).model_dump()
    payload["members_count"] = (
        (await db.execute(select(func.count()).select_from(User).where(User.organization_id == org.id))).scalar()
        or 0
    )
    payload["projects_count"] = (
        (await db.execute(select(func.count()).select_from(Project).where(Project.organization_id == org.id, Project.is_active == True))).scalar()
        or 0
    )

    return APIResponse(data=payload, meta=_meta())


@router.get("/me/members")
async def list_my_organization_members(
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    members = (
        await db.execute(
            select(User)
            .where(User.organization_id == user.organization_id)
            .order_by(User.created_at.asc())
        )
    ).scalars().all()
    payload = [OrganizationMemberOut.model_validate(member).model_dump() for member in members]
    return APIResponse(data=payload, meta=_meta())
