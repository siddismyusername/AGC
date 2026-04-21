"""CI/CD webhook endpoints — pipeline management and webhook receivers."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
import json
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from neo4j import AsyncSession as Neo4jSession
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.neo4j import Neo4jConnection
from app.core.responses import APIResponse, ResponseMeta
from app.core.security import hash_password
from app.models.compliance import CiCdToken, Pipeline
from app.models.user import User
from app.schemas.compliance import (
    CiCdTokenCreate,
    CiCdTokenOut,
    PipelineCreate,
    PipelineOut,
    UploadContractOut,
    UploadContractRequest,
)
from app.services import project_service
from app.services.compliance_engine import run_compliance_check

router = APIRouter(tags=["CI/CD Integration"])


def _meta() -> ResponseMeta:
    return ResponseMeta(request_id=str(uuid4()), timestamp=datetime.now(timezone.utc))


@router.post("/projects/{project_id}/uploads/contracts", status_code=status.HTTP_201_CREATED)
async def create_upload_contract(
    project_id: UUID,
    body: UploadContractRequest,
    user: User = Depends(require_roles("admin", "architect", "devops")),
):
    storage_key = f"projects/{project_id}/{uuid4()}-{body.filename}"
    upload_url = f"/api/v1/projects/{project_id}/uploads/{storage_key}"
    expires_at = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(minutes=15)

    return APIResponse(
        data=UploadContractOut(
            storage_key=storage_key,
            upload_url=upload_url,
            method="PUT",
            headers={"Content-Type": body.content_type},
            expires_at=expires_at,
            max_size_bytes=5 * 1024 * 1024,
            content_type=body.content_type,
            filename=body.filename,
        ).model_dump(),
        meta=_meta(),
    )


# ─── Pipeline Management ────────────────────────────────────────────────────

@router.post("/projects/{project_id}/pipelines", status_code=status.HTTP_201_CREATED)
async def create_pipeline(
    project_id: UUID,
    body: PipelineCreate,
    user: User = Depends(require_roles("admin", "devops")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new CI/CD pipeline integration."""
    webhook_secret = secrets.token_hex(32)
    pipeline = Pipeline(
        project_id=project_id,
        name=body.name,
        provider=body.provider,
        webhook_secret=webhook_secret,
        config=body.config,
        created_by=user.id,
    )
    db.add(pipeline)
    await db.commit()
    await db.refresh(pipeline)

    out = PipelineOut.model_validate(pipeline)
    out.webhook_url = f"/api/v1/webhooks/{pipeline.id}"
    return APIResponse(data=out, meta=_meta())


@router.get("/projects/{project_id}/pipelines")
async def list_pipelines(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all CI/CD pipelines for a project."""
    q = select(Pipeline).where(Pipeline.project_id == project_id).order_by(Pipeline.created_at.desc())
    rows = (await db.execute(q)).scalars().all()
    return APIResponse(data=[PipelineOut.model_validate(r) for r in rows], meta=_meta())


@router.delete("/projects/{project_id}/pipelines/{pipeline_id}")
async def delete_pipeline(
    project_id: UUID,
    pipeline_id: UUID,
    user: User = Depends(require_roles("admin", "devops")),
    db: AsyncSession = Depends(get_db),
):
    q = select(Pipeline).where(Pipeline.id == pipeline_id, Pipeline.project_id == project_id)
    pipeline = (await db.execute(q)).scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Pipeline not found"})
    await db.delete(pipeline)
    await db.commit()
    return APIResponse(data={"message": "Pipeline deleted"}, meta=_meta())


# ─── CI/CD Token Management ────────────────────────────────────────────────

@router.post("/projects/{project_id}/ci-tokens", status_code=status.HTTP_201_CREATED)
async def create_cicd_token(
    project_id: UUID,
    body: CiCdTokenCreate,
    user: User = Depends(require_roles("admin", "devops")),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new CI/CD API token for automated pipeline access."""
    raw_token = f"agcp_{secrets.token_urlsafe(48)}"
    token_hash_val = hashlib.sha256(raw_token.encode()).hexdigest()

    token_obj = CiCdToken(
        project_id=project_id,
        token_hash=token_hash_val,
        name=body.name,
        permissions=body.permissions,
        expires_at=body.expires_at,
        created_by=user.id,
    )
    db.add(token_obj)
    await db.commit()
    await db.refresh(token_obj)

    out = CiCdTokenOut.model_validate(token_obj)
    out.token = raw_token  # Only returned once
    return APIResponse(data=out, meta=_meta())


@router.get("/projects/{project_id}/ci-tokens")
async def list_cicd_tokens(
    project_id: UUID,
    user: User = Depends(require_roles("admin", "devops")),
    db: AsyncSession = Depends(get_db),
):
    q = select(CiCdToken).where(CiCdToken.project_id == project_id).order_by(CiCdToken.created_at.desc())
    rows = (await db.execute(q)).scalars().all()
    return APIResponse(data=[CiCdTokenOut.model_validate(r) for r in rows], meta=_meta())


@router.delete("/projects/{project_id}/ci-tokens/{token_id}")
async def revoke_cicd_token(
    project_id: UUID,
    token_id: UUID,
    user: User = Depends(require_roles("admin", "devops")),
    db: AsyncSession = Depends(get_db),
):
    q = select(CiCdToken).where(CiCdToken.id == token_id, CiCdToken.project_id == project_id)
    token = (await db.execute(q)).scalar_one_or_none()
    if not token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Token not found"})
    token.is_active = False
    await db.commit()
    return APIResponse(data={"message": "Token revoked"}, meta=_meta())


# ─── Webhook Receivers ──────────────────────────────────────────────────────

def _verify_github_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify GitHub HMAC-SHA256 webhook signature."""
    expected = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _verify_gitlab_token(token: str, secret: str) -> bool:
    """Verify GitLab webhook token."""
    return hmac.compare_digest(token, secret)


def _resolve_branch(ref_value: str | None, *, default_branch: str = "main") -> str:
    if not isinstance(ref_value, str) or not ref_value.strip():
        return default_branch
    segments = [segment for segment in ref_value.split("/") if segment]
    return segments[-1] if segments else default_branch


def _extract_github_context(event_name: str | None, payload: dict) -> tuple[str, str] | None:
    if event_name == "push":
        commit = str(payload.get("after") or "").strip()[:40]
        branch = _resolve_branch(payload.get("ref"))
        if len(commit) < 7:
            return None
        return commit, branch

    if event_name == "pull_request":
        pull_request = payload.get("pull_request") if isinstance(payload.get("pull_request"), dict) else {}
        head = pull_request.get("head") if isinstance(pull_request.get("head"), dict) else {}
        commit = str(head.get("sha") or "").strip()[:40]
        branch = str(head.get("ref") or "").strip() or "main"
        if len(commit) < 7:
            return None
        return commit, branch

    return None


def _extract_gitlab_context(event_name: str | None, payload: dict) -> tuple[str, str] | None:
    if event_name == "Push Hook":
        commit = str(payload.get("after") or "").strip()[:40]
        branch = _resolve_branch(payload.get("ref"))
        if len(commit) < 7:
            return None
        return commit, branch

    if event_name == "Merge Request Hook":
        object_attributes = payload.get("object_attributes") if isinstance(payload.get("object_attributes"), dict) else {}
        last_commit = object_attributes.get("last_commit") if isinstance(object_attributes.get("last_commit"), dict) else {}
        commit = str(last_commit.get("id") or "").strip()[:40]
        branch = str(object_attributes.get("source_branch") or "").strip() or "main"
        if len(commit) < 7:
            return None
        return commit, branch

    return None


async def _execute_pipeline_compliance(
    *,
    db: AsyncSession,
    neo4j_session: Neo4jSession,
    pipeline: Pipeline,
    commit_hash: str,
    branch: str,
) -> dict:
    active_version = await project_service.get_active_version(db, project_id=pipeline.project_id)
    if not active_version:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "NO_ACTIVE_ARCHITECTURE_VERSION",
                "message": "No active architecture version is available for CI/CD compliance checks.",
            },
        )

    pipeline_config = pipeline.config if isinstance(pipeline.config, dict) else {}
    compliance_options = pipeline_config.get("compliance_options") if isinstance(pipeline_config.get("compliance_options"), dict) else {}

    report = await run_compliance_check(
        db=db,
        neo4j_session=neo4j_session,
        project_id=pipeline.project_id,
        architecture_version_id=active_version.id,
        commit_hash=commit_hash,
        branch=branch,
        trigger="ci_cd",
        pipeline_id=pipeline.id,
        options=compliance_options,
    )

    should_block = report.status in {"failed", "error"}
    return {
        "compliance_report_id": str(report.id),
        "compliance_status": report.status,
        "health_score": report.health_score,
        "total_violations": report.total_violations,
        "critical_violations": report.critical_count,
        "major_violations": report.major_count,
        "should_block_pipeline": should_block,
    }


@router.post("/webhooks/{pipeline_id}/github")
async def github_webhook(
    pipeline_id: UUID,
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
    x_github_event: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    """Receive GitHub Actions webhook events and trigger compliance checks."""
    q = select(Pipeline).where(Pipeline.id == pipeline_id, Pipeline.is_active == True)
    pipeline = (await db.execute(q)).scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Pipeline not found"})

    if pipeline.provider != "github_actions":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_PIPELINE_PROVIDER", "message": "Pipeline provider does not match GitHub webhook endpoint"},
        )

    body = await request.body()

    if not x_hub_signature_256:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail={"code": "MISSING_SIGNATURE", "message": "GitHub signature header is required"},
        )
    if not _verify_github_signature(body, x_hub_signature_256, pipeline.webhook_secret):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"code": "INVALID_SIGNATURE", "message": "Webhook signature verification failed"})

    try:
        payload = json.loads(body.decode("utf-8"))
    except ValueError:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_WEBHOOK_PAYLOAD", "message": "Webhook payload must be valid JSON"},
        )

    if not isinstance(payload, dict):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_WEBHOOK_PAYLOAD", "message": "Webhook payload must be a JSON object"},
        )

    if x_github_event == "ping":
        return APIResponse(data={"message": "pong"}, meta=_meta())

    context = _extract_github_context(x_github_event, payload)
    if context is None:
        return APIResponse(
            data={
                "message": f"Event '{x_github_event}' acknowledged but ignored",
                "pipeline_id": str(pipeline_id),
                "action": "ignored",
                "should_block_pipeline": False,
            },
            meta=_meta(),
        )

    commit, branch = context
    compliance_result = await _execute_pipeline_compliance(
        db=db,
        neo4j_session=neo4j_session,
        pipeline=pipeline,
        commit_hash=commit,
        branch=branch,
    )

    return APIResponse(
        data={
            "message": f"GitHub event '{x_github_event}' processed",
            "pipeline_id": str(pipeline_id),
            "commit": commit,
            "branch": branch,
            "action": "compliance_check_completed",
            **compliance_result,
        },
        meta=_meta(),
    )


@router.post("/webhooks/{pipeline_id}/gitlab")
async def gitlab_webhook(
    pipeline_id: UUID,
    request: Request,
    x_gitlab_token: Optional[str] = Header(None),
    x_gitlab_event: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    """Receive GitLab CI webhook events and trigger compliance checks."""
    q = select(Pipeline).where(Pipeline.id == pipeline_id, Pipeline.is_active == True)
    pipeline = (await db.execute(q)).scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Pipeline not found"})

    if pipeline.provider != "gitlab_ci":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_PIPELINE_PROVIDER", "message": "Pipeline provider does not match GitLab webhook endpoint"},
        )

    if not x_gitlab_token:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail={"code": "MISSING_TOKEN", "message": "GitLab token header is required"},
        )
    if not _verify_gitlab_token(x_gitlab_token, pipeline.webhook_secret):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"code": "INVALID_TOKEN", "message": "Webhook token verification failed"})

    body = await request.body()
    try:
        payload = json.loads(body.decode("utf-8"))
    except ValueError:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_WEBHOOK_PAYLOAD", "message": "Webhook payload must be valid JSON"},
        )

    if not isinstance(payload, dict):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_WEBHOOK_PAYLOAD", "message": "Webhook payload must be a JSON object"},
        )

    context = _extract_gitlab_context(x_gitlab_event, payload)
    if context is None:
        return APIResponse(
            data={
                "message": f"Event '{x_gitlab_event}' acknowledged but ignored",
                "pipeline_id": str(pipeline_id),
                "action": "ignored",
                "should_block_pipeline": False,
            },
            meta=_meta(),
        )

    commit, branch = context
    compliance_result = await _execute_pipeline_compliance(
        db=db,
        neo4j_session=neo4j_session,
        pipeline=pipeline,
        commit_hash=commit,
        branch=branch,
    )

    return APIResponse(
        data={
            "message": f"GitLab event '{x_gitlab_event}' processed",
            "pipeline_id": str(pipeline_id),
            "commit": commit,
            "branch": branch,
            "action": "compliance_check_completed",
            **compliance_result,
        },
        meta=_meta(),
    )
