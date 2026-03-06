"""Compliance check, static analysis, and reporting endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from neo4j import AsyncSession as Neo4jSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.neo4j import Neo4jConnection
from app.core.responses import APIResponse, ResponseMeta, build_pagination
from app.models.compliance import ComplianceReport, Violation
from app.models.user import User
from app.schemas.compliance import (
    AnalysisRequest,
    ComplianceCheckRequest,
    ComplianceReportOut,
    HealthScoreOut,
    ViolationOut,
)
from app.services.compliance_engine import run_compliance_check
from app.services.static_analyzer import PythonAnalyzer

router = APIRouter(tags=["Compliance"])


def _meta() -> ResponseMeta:
    return ResponseMeta(request_id=str(uuid4()), timestamp=datetime.now(timezone.utc))


# ─── Static analysis ────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
async def trigger_analysis(
    project_id: UUID,
    body: AnalysisRequest,
    user: User = Depends(require_roles("admin", "architect", "developer", "devops")),
    db: AsyncSession = Depends(get_db),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    """Trigger static analysis on a repository path and store the actual dependency graph."""
    from app.services import graph_service

    analyzer = PythonAnalyzer(
        repo_path=body.repository_path,
        include_patterns=body.options.include_patterns if body.options else None,
        exclude_patterns=body.options.exclude_patterns if body.options else None,
    )
    result = analyzer.analyze()

    # Clean previous analysis data for this version
    await graph_service.clean_analysis_data(
        neo4j_session, architecture_version_id=str(body.architecture_version_id)
    )

    # Store actual components in Neo4j
    for module in result["modules"]:
        await graph_service.store_actual_component(
            neo4j_session,
            name=module["name"],
            file_path=module.get("file_path", ""),
            component_type="module",
            architecture_version_id=str(body.architecture_version_id),
        )

    # Store actual dependencies
    for dep in result["dependencies"]:
        await graph_service.store_actual_dependency(
            neo4j_session,
            source_name=dep["source"],
            target_name=dep["target"],
            dep_type=dep.get("type", "imports"),
            architecture_version_id=str(body.architecture_version_id),
        )

    return APIResponse(
        data={
            "status": "completed",
            "architecture_version_id": str(body.architecture_version_id),
            "stats": result.get("stats", {}),
            "module_count": len(result["modules"]),
            "dependency_count": len(result["dependencies"]),
            "cycles": result.get("cycles", []),
        },
        meta=_meta(),
    )


@router.get("/projects/{project_id}/analysis/{version_id}/actual-graph")
async def get_actual_graph(
    project_id: UUID,
    version_id: UUID,
    user: User = Depends(get_current_user),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    """Get the actual code dependency graph from static analysis."""
    from app.services import graph_service

    graph = await graph_service.get_actual_graph(neo4j_session, architecture_version_id=str(version_id))
    return APIResponse(data=graph, meta=_meta())


# ─── Compliance checks ──────────────────────────────────────────────────────

@router.post("/projects/{project_id}/compliance/check", status_code=status.HTTP_202_ACCEPTED)
async def trigger_compliance_check(
    project_id: UUID,
    body: ComplianceCheckRequest,
    user: User = Depends(require_roles("admin", "architect", "developer", "devops")),
    db: AsyncSession = Depends(get_db),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    """Run a compliance check comparing intended vs actual architecture."""
    report = await run_compliance_check(
        db=db,
        neo4j_session=neo4j_session,
        project_id=project_id,
        architecture_version_id=body.architecture_version_id,
        commit_hash=body.commit_hash,
        branch=body.branch,
        trigger=body.trigger,
        options=body.options.model_dump() if body.options else None,
    )
    return APIResponse(data=report, meta=_meta())


@router.get("/projects/{project_id}/compliance/reports")
async def list_compliance_reports(
    project_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all compliance reports for a project."""
    offset = (page - 1) * page_size

    count_q = select(func.count()).select_from(ComplianceReport).where(
        ComplianceReport.project_id == project_id
    )
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(ComplianceReport)
        .where(ComplianceReport.project_id == project_id)
        .order_by(ComplianceReport.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = (await db.execute(q)).scalars().all()

    return APIResponse(
        data=[ComplianceReportOut.model_validate(r) for r in rows],
        meta=_meta(),
        pagination=build_pagination(page, page_size, total),
    )


@router.get("/projects/{project_id}/compliance/reports/{report_id}")
async def get_compliance_report(
    project_id: UUID,
    report_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single compliance report with summary."""
    q = select(ComplianceReport).where(
        ComplianceReport.id == report_id,
        ComplianceReport.project_id == project_id,
    )
    report = (await db.execute(q)).scalar_one_or_none()
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Report not found"})
    return APIResponse(data=ComplianceReportOut.model_validate(report), meta=_meta())


@router.get("/projects/{project_id}/compliance/reports/{report_id}/violations")
async def list_violations(
    project_id: UUID,
    report_id: UUID,
    severity: Optional[str] = Query(None),
    violation_type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List violations for a specific report with optional filters."""
    offset = (page - 1) * page_size

    filters = [Violation.report_id == report_id]
    if severity:
        filters.append(Violation.severity == severity)
    if violation_type:
        filters.append(Violation.violation_type == violation_type)

    count_q = select(func.count()).select_from(Violation).where(*filters)
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(Violation)
        .where(*filters)
        .order_by(Violation.severity.desc(), Violation.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = (await db.execute(q)).scalars().all()

    return APIResponse(
        data=[ViolationOut.model_validate(r) for r in rows],
        meta=_meta(),
        pagination=build_pagination(page, page_size, total),
    )


# ─── Health score ────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/compliance/health")
async def get_health_score(
    project_id: UUID,
    version_id: Optional[UUID] = Query(None, description="Filter by architecture version"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the latest health score for a project."""
    q = (
        select(ComplianceReport)
        .where(ComplianceReport.project_id == project_id)
        .order_by(ComplianceReport.created_at.desc())
        .limit(1)
    )
    if version_id:
        q = q.where(ComplianceReport.architecture_version_id == version_id)

    report = (await db.execute(q)).scalar_one_or_none()
    if not report:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"code": "NO_REPORTS", "message": "No compliance reports found"},
        )

    # Count violations by severity
    sev_q = (
        select(Violation.severity, func.count())
        .where(Violation.report_id == report.id)
        .group_by(Violation.severity)
    )
    sev_rows = (await db.execute(sev_q)).all()
    severity_counts = {row[0]: row[1] for row in sev_rows}

    return APIResponse(
        data=HealthScoreOut(
            health_score=report.health_score,
            total_violations=report.total_violations,
            critical_count=severity_counts.get("critical", 0),
            major_count=severity_counts.get("major", 0),
            minor_count=severity_counts.get("minor", 0),
            info_count=severity_counts.get("info", 0),
            report_id=report.id,
            checked_at=report.created_at,
        ),
        meta=_meta(),
    )
