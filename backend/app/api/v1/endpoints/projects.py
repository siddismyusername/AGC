"""Project & Architecture CRUD endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.responses import APIResponse, ResponseMeta, build_pagination
from app.models.user import User
from app.schemas.project import (
    ArchVersionCreate,
    ArchVersionOut,
    ArchVersionStatusUpdate,
    ProjectCreate,
    ProjectListItem,
    ProjectOut,
    ProjectUpdate,
    RuleBatchCreate,
    RuleCreate,
    RuleOut,
    RuleUpdate,
)
from app.services import project_service

router = APIRouter(tags=["Projects"])


def _meta() -> ResponseMeta:
    return ResponseMeta(request_id=str(uuid4()), timestamp=datetime.now(timezone.utc))


# ──────────────────────────── Projects ────────────────────────────

@router.post("/projects", status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.create_project(
        db,
        name=body.name,
        description=body.description,
        repository_url=body.repository_url,
        default_branch=body.default_branch,
        language=body.language,
        user=user,
    )
    return APIResponse(data=ProjectOut.model_validate(project).model_dump(), meta=_meta())


@router.get("/projects")
async def list_projects(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
    is_active: bool | None = True,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    projects, total = await project_service.list_projects(
        db, org_id=user.organization_id, page=page, per_page=per_page, search=search, is_active=is_active
    )
    return APIResponse(
        data=[ProjectListItem.model_validate(p).model_dump() for p in projects],
        meta=_meta(),
        pagination=build_pagination(page, per_page, total),
    )


@router.get("/projects/{project_id}")
async def get_project(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.get_project(db, project_id=project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Project not found"})
    return APIResponse(data=ProjectOut.model_validate(project).model_dump(), meta=_meta())


@router.put("/projects/{project_id}")
async def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.update_project(
        db,
        project_id=project_id,
        updates=body.model_dump(exclude_unset=True),
        actor_user_id=user.id,
    )
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Project not found"})
    return APIResponse(data=ProjectOut.model_validate(project).model_dump(), meta=_meta())


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: UUID,
    user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    success = await project_service.delete_project(db, project_id=project_id, actor_user_id=user.id)
    if not success:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Project not found"})
    return APIResponse(data={"message": "Project deleted"}, meta=_meta())


# ──────────────────── Architecture Versions ────────────────────

@router.post("/projects/{project_id}/architecture", status_code=status.HTTP_201_CREATED)
async def create_arch_version(
    project_id: UUID,
    body: ArchVersionCreate,
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    version = await project_service.create_architecture_version(
        db, project_id=project_id, description=body.description, user_id=user.id
    )
    return APIResponse(data=ArchVersionOut.model_validate(version).model_dump(), meta=_meta())


@router.get("/projects/{project_id}/architecture")
async def list_arch_versions(
    project_id: UUID,
    status_filter: str | None = Query(None, alias="status"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    versions = await project_service.list_architecture_versions(db, project_id=project_id, status=status_filter)
    return APIResponse(
        data=[ArchVersionOut.model_validate(v).model_dump() for v in versions],
        meta=_meta(),
    )


@router.get("/projects/{project_id}/architecture/{version_id}")
async def get_arch_version(
    project_id: UUID,
    version_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    version = await project_service.get_architecture_version(db, version_id=version_id)
    if not version:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Architecture version not found"})
    return APIResponse(data=ArchVersionOut.model_validate(version).model_dump(), meta=_meta())


@router.patch("/projects/{project_id}/architecture/{version_id}/status")
async def update_arch_status(
    project_id: UUID,
    version_id: UUID,
    body: ArchVersionStatusUpdate,
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    try:
        version = await project_service.update_version_status(
            db,
            version_id=version_id,
            new_status=body.status,
            actor_user_id=user.id,
        )
    except ValueError as e:
        msg = str(e)
        if "NOT_FOUND" in msg:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Version not found"})
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "UNPROCESSABLE_ENTITY", "message": msg})

    return APIResponse(data=ArchVersionOut.model_validate(version).model_dump(), meta=_meta())


# ──────────────────────── Architecture Rules ──────────────────────

@router.post("/architecture/{version_id}/rules", status_code=status.HTTP_201_CREATED)
async def create_rule(
    version_id: UUID,
    body: RuleCreate,
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    rule = await project_service.create_rule(
        db,
        version_id=version_id,
        rule_text=body.rule_text,
        rule_type=body.rule_type,
        source_component=body.source_component,
        target_component=body.target_component,
        severity=body.severity,
        user_id=user.id,
    )
    return APIResponse(data=RuleOut.model_validate(rule).model_dump(), meta=_meta())


@router.post("/architecture/{version_id}/rules/batch", status_code=status.HTTP_201_CREATED)
async def create_rules_batch(
    version_id: UUID,
    body: RuleBatchCreate,
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    rules = await project_service.create_rules_batch(
        db,
        version_id=version_id,
        rules_data=[r.model_dump() for r in body.rules],
        user_id=user.id,
    )
    return APIResponse(
        data={"created_count": len(rules), "rules": [RuleOut.model_validate(r).model_dump() for r in rules]},
        meta=_meta(),
    )


@router.get("/architecture/{version_id}/rules")
async def list_rules(
    version_id: UUID,
    rule_type: str | None = None,
    severity: str | None = None,
    is_active: bool | None = True,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rules = await project_service.list_rules(
        db, version_id=version_id, rule_type=rule_type, severity=severity, is_active=is_active
    )
    return APIResponse(
        data=[RuleOut.model_validate(r).model_dump() for r in rules],
        meta=_meta(),
    )


@router.put("/architecture/{version_id}/rules/{rule_id}")
async def update_rule(
    version_id: UUID,
    rule_id: UUID,
    body: RuleUpdate,
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    rule = await project_service.update_rule(
        db,
        rule_id=rule_id,
        updates=body.model_dump(exclude_unset=True),
        actor_user_id=user.id,
    )
    if not rule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Rule not found"})
    return APIResponse(data=RuleOut.model_validate(rule).model_dump(), meta=_meta())


@router.delete("/architecture/{version_id}/rules/{rule_id}")
async def delete_rule(
    version_id: UUID,
    rule_id: UUID,
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    success = await project_service.delete_rule(db, rule_id=rule_id, actor_user_id=user.id)
    if not success:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Rule not found"})
    return APIResponse(data={"message": "Rule deleted"}, meta=_meta())
