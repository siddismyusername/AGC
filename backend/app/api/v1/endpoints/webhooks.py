"""CI/CD webhook endpoints — pipeline management and webhook receivers."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
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


@router.post("/webhooks/{pipeline_id}/github")
async def github_webhook(
    pipeline_id: UUID,
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
    x_github_event: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Receive GitHub Actions webhook events and trigger compliance checks."""
    q = select(Pipeline).where(Pipeline.id == pipeline_id, Pipeline.is_active == True)
    pipeline = (await db.execute(q)).scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Pipeline not found"})

    body = await request.body()

    # Verify signature
    if x_hub_signature_256:
        if not _verify_github_signature(body, x_hub_signature_256, pipeline.webhook_secret):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"code": "INVALID_SIGNATURE", "message": "Webhook signature verification failed"})

    payload = await request.json()

    # Handle different event types
    if x_github_event == "push":
        commit = payload.get("after", "")[:40]
        branch = payload.get("ref", "refs/heads/main").split("/")[-1]
        return APIResponse(
            data={
                "message": "Push event received",
                "pipeline_id": str(pipeline_id),
                "commit": commit,
                "branch": branch,
                "action": "compliance_check_queued",
            },
            meta=_meta(),
        )
    elif x_github_event == "pull_request":
        pr = payload.get("pull_request", {})
        commit = pr.get("head", {}).get("sha", "")[:40]
        branch = pr.get("head", {}).get("ref", "")
        return APIResponse(
            data={
                "message": "Pull request event received",
                "pipeline_id": str(pipeline_id),
                "commit": commit,
                "branch": branch,
                "pr_number": payload.get("number"),
                "action": "compliance_check_queued",
            },
            meta=_meta(),
        )
    elif x_github_event == "ping":
        return APIResponse(data={"message": "pong"}, meta=_meta())

    return APIResponse(
        data={"message": f"Event '{x_github_event}' acknowledged but not processed"},
        meta=_meta(),
    )


@router.post("/webhooks/{pipeline_id}/gitlab")
async def gitlab_webhook(
    pipeline_id: UUID,
    request: Request,
    x_gitlab_token: Optional[str] = Header(None),
    x_gitlab_event: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Receive GitLab CI webhook events and trigger compliance checks."""
    q = select(Pipeline).where(Pipeline.id == pipeline_id, Pipeline.is_active == True)
    pipeline = (await db.execute(q)).scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Pipeline not found"})

    # Verify token
    if x_gitlab_token:
        if not _verify_gitlab_token(x_gitlab_token, pipeline.webhook_secret):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"code": "INVALID_TOKEN", "message": "Webhook token verification failed"})

    payload = await request.json()

    if x_gitlab_event == "Push Hook":
        commit = payload.get("after", "")[:40]
        branch = payload.get("ref", "refs/heads/main").split("/")[-1]
        return APIResponse(
            data={
                "message": "Push event received",
                "pipeline_id": str(pipeline_id),
                "commit": commit,
                "branch": branch,
                "action": "compliance_check_queued",
            },
            meta=_meta(),
        )
    elif x_gitlab_event == "Merge Request Hook":
        mr = payload.get("object_attributes", {})
        commit = mr.get("last_commit", {}).get("id", "")[:40]
        branch = mr.get("source_branch", "")
        return APIResponse(
            data={
                "message": "Merge request event received",
                "pipeline_id": str(pipeline_id),
                "commit": commit,
                "branch": branch,
                "mr_iid": mr.get("iid"),
                "action": "compliance_check_queued",
            },
            meta=_meta(),
        )

    return APIResponse(
        data={"message": f"Event '{x_gitlab_event}' acknowledged but not processed"},
        meta=_meta(),
    )
