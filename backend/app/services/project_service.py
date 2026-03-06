"""Project & Architecture management service."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project import ArchitectureVersion, Project
from app.models.rule import ArchitectureRule
from app.models.user import User


# ──────────────────────────── Projects ────────────────────────────

async def create_project(
    db: AsyncSession,
    *,
    name: str,
    description: str | None,
    repository_url: str | None,
    default_branch: str,
    language: str,
    user: User,
) -> Project:
    project = Project(
        name=name,
        description=description,
        repository_url=repository_url,
        default_branch=default_branch,
        language=language,
        organization_id=user.organization_id,
        created_by=user.id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


async def list_projects(
    db: AsyncSession,
    *,
    org_id: UUID,
    page: int = 1,
    per_page: int = 20,
    search: str | None = None,
    is_active: bool | None = True,
) -> tuple[list[Project], int]:
    q = select(Project).where(Project.organization_id == org_id)

    if is_active is not None:
        q = q.where(Project.is_active == is_active)
    if search:
        q = q.where(Project.name.ilike(f"%{search}%"))

    # Count
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginate
    q = q.order_by(Project.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(q)

    return list(result.scalars().all()), total


async def get_project(db: AsyncSession, *, project_id: UUID) -> Project | None:
    result = await db.execute(select(Project).where(Project.id == project_id))
    return result.scalar_one_or_none()


async def update_project(
    db: AsyncSession,
    *,
    project_id: UUID,
    updates: dict,
) -> Project | None:
    project = await get_project(db, project_id=project_id)
    if not project:
        return None
    for k, v in updates.items():
        if v is not None:
            setattr(project, k, v)
    project.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(project)
    return project


async def delete_project(db: AsyncSession, *, project_id: UUID) -> bool:
    project = await get_project(db, project_id=project_id)
    if not project:
        return False
    project.is_active = False
    project.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return True


# ──────────────────── Architecture Versions ────────────────────

VALID_TRANSITIONS = {
    "draft": ["under_review"],
    "under_review": ["approved", "draft"],
    "approved": ["active"],
    "active": ["deprecated"],
    "deprecated": [],
}


async def create_architecture_version(
    db: AsyncSession,
    *,
    project_id: UUID,
    description: str | None,
    user_id: UUID,
) -> ArchitectureVersion:
    # Get next version number
    result = await db.execute(
        select(func.coalesce(func.max(ArchitectureVersion.version_number), 0))
        .where(ArchitectureVersion.project_id == project_id)
    )
    next_version = (result.scalar() or 0) + 1

    version = ArchitectureVersion(
        project_id=project_id,
        version_number=next_version,
        description=description,
        created_by=user_id,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


async def list_architecture_versions(
    db: AsyncSession,
    *,
    project_id: UUID,
    status: str | None = None,
) -> list[ArchitectureVersion]:
    q = select(ArchitectureVersion).where(ArchitectureVersion.project_id == project_id)
    if status:
        q = q.where(ArchitectureVersion.status == status)
    q = q.order_by(ArchitectureVersion.version_number.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_architecture_version(
    db: AsyncSession,
    *,
    version_id: UUID,
) -> ArchitectureVersion | None:
    result = await db.execute(
        select(ArchitectureVersion).where(ArchitectureVersion.id == version_id)
    )
    return result.scalar_one_or_none()


async def get_active_version(
    db: AsyncSession,
    *,
    project_id: UUID,
) -> ArchitectureVersion | None:
    result = await db.execute(
        select(ArchitectureVersion).where(
            ArchitectureVersion.project_id == project_id,
            ArchitectureVersion.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def update_version_status(
    db: AsyncSession,
    *,
    version_id: UUID,
    new_status: str,
) -> ArchitectureVersion:
    version = await get_architecture_version(db, version_id=version_id)
    if not version:
        raise ValueError("VERSION_NOT_FOUND")

    allowed = VALID_TRANSITIONS.get(version.status, [])
    if new_status not in allowed:
        raise ValueError(f"INVALID_TRANSITION: {version.status} → {new_status}")

    previous_status = version.status
    version.status = new_status
    version.updated_at = datetime.now(timezone.utc)

    if new_status == "active":
        version.activated_at = datetime.now(timezone.utc)
        # Deprecate any previously active version for this project
        await db.execute(
            update(ArchitectureVersion)
            .where(
                ArchitectureVersion.project_id == version.project_id,
                ArchitectureVersion.status == "active",
                ArchitectureVersion.id != version_id,
            )
            .values(status="deprecated", updated_at=datetime.now(timezone.utc))
        )

    await db.commit()
    await db.refresh(version)
    return version


# ──────────────────────── Architecture Rules ──────────────────────

async def create_rule(
    db: AsyncSession,
    *,
    version_id: UUID,
    rule_text: str,
    rule_type: str,
    source_component: str | None,
    target_component: str | None,
    severity: str,
    user_id: UUID | None,
    is_ai_generated: bool = False,
    confidence_score: float | None = None,
) -> ArchitectureRule:
    rule = ArchitectureRule(
        architecture_version_id=version_id,
        rule_text=rule_text,
        rule_type=rule_type,
        source_component=source_component,
        target_component=target_component,
        severity=severity,
        is_ai_generated=is_ai_generated,
        confidence_score=confidence_score,
        created_by=user_id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def create_rules_batch(
    db: AsyncSession,
    *,
    version_id: UUID,
    rules_data: list[dict],
    user_id: UUID | None,
) -> list[ArchitectureRule]:
    rules = []
    for rd in rules_data:
        rule = ArchitectureRule(
            architecture_version_id=version_id,
            rule_text=rd["rule_text"],
            rule_type=rd["rule_type"],
            source_component=rd.get("source_component"),
            target_component=rd.get("target_component"),
            severity=rd.get("severity", "major"),
            is_ai_generated=rd.get("is_ai_generated", False),
            confidence_score=rd.get("confidence_score"),
            created_by=user_id,
        )
        db.add(rule)
        rules.append(rule)
    await db.commit()
    for r in rules:
        await db.refresh(r)
    return rules


async def list_rules(
    db: AsyncSession,
    *,
    version_id: UUID,
    rule_type: str | None = None,
    severity: str | None = None,
    is_active: bool | None = True,
) -> list[ArchitectureRule]:
    q = select(ArchitectureRule).where(ArchitectureRule.architecture_version_id == version_id)
    if rule_type:
        q = q.where(ArchitectureRule.rule_type == rule_type)
    if severity:
        q = q.where(ArchitectureRule.severity == severity)
    if is_active is not None:
        q = q.where(ArchitectureRule.is_active == is_active)
    q = q.order_by(ArchitectureRule.created_at.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_rule(db: AsyncSession, *, rule_id: UUID) -> ArchitectureRule | None:
    result = await db.execute(select(ArchitectureRule).where(ArchitectureRule.id == rule_id))
    return result.scalar_one_or_none()


async def update_rule(
    db: AsyncSession,
    *,
    rule_id: UUID,
    updates: dict,
) -> ArchitectureRule | None:
    rule = await get_rule(db, rule_id=rule_id)
    if not rule:
        return None
    for k, v in updates.items():
        if v is not None:
            setattr(rule, k, v)
    rule.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(rule)
    return rule


async def delete_rule(db: AsyncSession, *, rule_id: UUID) -> bool:
    rule = await get_rule(db, rule_id=rule_id)
    if not rule:
        return False
    rule.is_active = False
    rule.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return True
