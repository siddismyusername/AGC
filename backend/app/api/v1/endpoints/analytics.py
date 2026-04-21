"""Analytics API endpoints."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from time import perf_counter
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.responses import APIResponse, ResponseMeta
from app.models.audit import AuditLog
from app.models.compliance import ComplianceReport
from app.models.document import UploadedDocument
from app.models.project import Project
from app.models.user import User
from app.schemas.analytics import (
    AICandidateReviewTrendOut,
    AICandidateReviewTrendPointOut,
    AnalyticsHistoryOut,
    AnalyticsHistoryPointOut,
    AnalyticsSummaryOut,
    DocumentMetricsTrendOut,
    DocumentMetricsTrendPointOut,
    WorkerHealthOut,
    WorkerOpsCommandOut,
    WorkerOpsHintsOut,
    WorkerReplayQueueItemOut,
    WorkerReplayQueueOut,
    WorkerReplayQueueRequest,
)
from app.services import document_extraction
from app.services.extractor_diagnostics_history import append_extractor_history
from app.tasks.document_tasks import enqueue_document_processing

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _meta() -> ResponseMeta:
    return ResponseMeta(request_id=str(uuid4()), timestamp=datetime.now(timezone.utc))


async def _check_redis_health() -> tuple[str, float | None]:
    redis = Redis.from_url(settings.REDIS_URL)
    start = perf_counter()
    try:
        await redis.ping()
        latency_ms = round((perf_counter() - start) * 1000, 2)
        return "healthy", latency_ms
    except Exception:
        return "unreachable", None
    finally:
        await redis.aclose()


def _inspect_celery_workers() -> int:
    try:
        workers = celery_app.control.inspect(timeout=1.0).ping()
    except Exception:
        return 0
    if not workers:
        return 0
    return len(workers)


def _derive_worker_status(redis_status: str, celery_worker_count: int) -> str:
    if redis_status == "healthy" and celery_worker_count > 0:
        return "healthy"
    if redis_status == "healthy":
        return "degraded"
    return "down"


def _parse_iso_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _get_latest_replay_timestamp(documents: list[UploadedDocument]) -> datetime | None:
    latest: datetime | None = None
    for document in documents:
        extracted_data = document.extracted_data if isinstance(document.extracted_data, dict) else {}
        dead_letter_meta = extracted_data.get("dead_letter") if isinstance(extracted_data, dict) else None
        if not isinstance(dead_letter_meta, dict):
            continue
        replay_timestamp = _parse_iso_datetime(dead_letter_meta.get("last_replay_requested_at"))
        if replay_timestamp and (latest is None or replay_timestamp > latest):
            latest = replay_timestamp
    return latest


def _get_latest_replay_activity(documents: list[UploadedDocument]) -> tuple[datetime | None, int]:
    latest: datetime | None = None
    latest_count = 0

    for document in documents:
        extracted_data = document.extracted_data if isinstance(document.extracted_data, dict) else {}
        dead_letter_meta = extracted_data.get("dead_letter") if isinstance(extracted_data, dict) else None
        if not isinstance(dead_letter_meta, dict):
            continue

        replay_timestamp = _parse_iso_datetime(dead_letter_meta.get("last_replay_requested_at"))
        if not replay_timestamp:
            continue

        if latest is None or replay_timestamp > latest:
            latest = replay_timestamp
            latest_count = 1
        elif replay_timestamp == latest:
            latest_count += 1

    return latest, latest_count


def _raise_if_replay_rate_limited(latest_replay_at: datetime | None) -> None:
    cooldown_seconds = max(0, int(settings.WORKER_REPLAY_COOLDOWN_SECONDS))
    if cooldown_seconds <= 0 or latest_replay_at is None:
        return

    now = datetime.now(timezone.utc)
    elapsed = (now - latest_replay_at).total_seconds()
    if elapsed >= cooldown_seconds:
        return

    retry_after_seconds = max(1, int(cooldown_seconds - elapsed))
    next_available_at = latest_replay_at + timedelta(seconds=cooldown_seconds)
    raise HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "RATE_LIMITED",
            "message": "Replay actions are temporarily rate limited for this project.",
            "retry_after_seconds": retry_after_seconds,
            "next_available_at": next_available_at.isoformat(),
        },
    )


def _build_document_metrics_trend_points(upload_rows: list[object], status_rows: list[object]) -> list[DocumentMetricsTrendPointOut]:
    buckets: dict[datetime, dict[str, int]] = {}
    for row in upload_rows:
        bucket = row.bucket_start
        entry = buckets.setdefault(
            bucket,
            {"uploaded_count": 0, "completed_count": 0, "failed_count": 0, "processing_count": 0},
        )
        entry["uploaded_count"] = int(row.uploaded_count or 0)

    for row in status_rows:
        bucket = row.bucket_start
        entry = buckets.setdefault(
            bucket,
            {"uploaded_count": 0, "completed_count": 0, "failed_count": 0, "processing_count": 0},
        )
        entry["completed_count"] = int(row.completed_count or 0)
        entry["failed_count"] = int(row.failed_count or 0)
        entry["processing_count"] = int(row.processing_count or 0)

    points: list[DocumentMetricsTrendPointOut] = []
    previous_counts: dict[str, int] | None = None
    for bucket, counts in sorted(buckets.items(), key=lambda item: item[0]):
        processed_total = counts["completed_count"] + counts["failed_count"]
        success_rate_percent = None
        failure_rate_percent = None
        if processed_total > 0:
            success_rate_percent = round((counts["completed_count"] / processed_total) * 100, 2)
            failure_rate_percent = round((counts["failed_count"] / processed_total) * 100, 2)

        if previous_counts is None:
            uploaded_delta = 0
            completed_delta = 0
            failed_delta = 0
            processing_delta = 0
        else:
            uploaded_delta = counts["uploaded_count"] - previous_counts["uploaded_count"]
            completed_delta = counts["completed_count"] - previous_counts["completed_count"]
            failed_delta = counts["failed_count"] - previous_counts["failed_count"]
            processing_delta = counts["processing_count"] - previous_counts["processing_count"]

        points.append(
            DocumentMetricsTrendPointOut(
                bucket_start=bucket,
                uploaded_count=counts["uploaded_count"],
                completed_count=counts["completed_count"],
                failed_count=counts["failed_count"],
                processing_count=counts["processing_count"],
                uploaded_delta_day_over_day=uploaded_delta,
                completed_delta_day_over_day=completed_delta,
                failed_delta_day_over_day=failed_delta,
                processing_delta_day_over_day=processing_delta,
                success_rate_percent=success_rate_percent,
                failure_rate_percent=failure_rate_percent,
            )
        )
        previous_counts = counts

    return points


def _count_review_indexes(review: dict[str, object], prefix: str) -> int:
    value = review.get(prefix)
    if isinstance(value, list):
        return len(value)
    return 0


def _build_ai_candidate_review_trend_points(
    review_entries: list[dict[str, object]],
    cutoff: datetime,
) -> tuple[list[AICandidateReviewTrendPointOut], int, int, int, int, datetime | None]:
    buckets: dict[datetime, dict[str, object]] = {}
    total_reviews = 0
    reviewed_document_ids: set[str] = set()
    accepted_candidates = 0
    rejected_candidates = 0
    last_reviewed_at: datetime | None = None

    for review in review_entries:
        reviewed_at = _parse_iso_datetime(review.get("reviewed_at"))
        if reviewed_at is None or reviewed_at < cutoff:
            continue

        total_reviews += 1
        document_id = review.get("document_id")
        if isinstance(document_id, str) and document_id:
            reviewed_document_ids.add(document_id)

        accepted_count = sum(
            _count_review_indexes(review, key)
            for key in (
                "accepted_rule_indexes",
                "accepted_entity_indexes",
                "accepted_relationship_indexes",
            )
        )
        rejected_count = sum(
            _count_review_indexes(review, key)
            for key in (
                "rejected_rule_indexes",
                "rejected_entity_indexes",
                "rejected_relationship_indexes",
            )
        )

        accepted_candidates += accepted_count
        rejected_candidates += rejected_count

        if last_reviewed_at is None or reviewed_at > last_reviewed_at:
            last_reviewed_at = reviewed_at

        bucket = reviewed_at.replace(hour=0, minute=0, second=0, microsecond=0)
        bucket_entry = buckets.setdefault(
            bucket,
            {
                "review_count": 0,
                "reviewed_documents": set(),
                "accepted_candidates": 0,
                "rejected_candidates": 0,
            },
        )
        bucket_entry["review_count"] = int(bucket_entry["review_count"]) + 1
        if isinstance(document_id, str) and document_id:
            bucket_entry["reviewed_documents"].add(document_id)
        bucket_entry["accepted_candidates"] = int(bucket_entry["accepted_candidates"]) + accepted_count
        bucket_entry["rejected_candidates"] = int(bucket_entry["rejected_candidates"]) + rejected_count

    points: list[AICandidateReviewTrendPointOut] = []
    for bucket_start, bucket_entry in sorted(buckets.items(), key=lambda item: item[0]):
        bucket_accepted = int(bucket_entry["accepted_candidates"])
        bucket_rejected = int(bucket_entry["rejected_candidates"])
        total_candidates = bucket_accepted + bucket_rejected
        acceptance_rate_percent = None
        if total_candidates > 0:
            acceptance_rate_percent = round((bucket_accepted / total_candidates) * 100, 2)

        points.append(
            AICandidateReviewTrendPointOut(
                bucket_start=bucket_start,
                review_count=int(bucket_entry["review_count"]),
                reviewed_documents=len(bucket_entry["reviewed_documents"]),
                accepted_candidates=bucket_accepted,
                rejected_candidates=bucket_rejected,
                acceptance_rate_percent=acceptance_rate_percent,
            )
        )

    return points, total_reviews, len(reviewed_document_ids), accepted_candidates, rejected_candidates, last_reviewed_at


@router.get("/summary")
async def get_analytics_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    active_projects = (
        await db.execute(
            select(func.count()).select_from(Project).where(
                Project.organization_id == user.organization_id,
                Project.is_active == True,
            )
        )
    ).scalar() or 0

    report_scope = select(ComplianceReport).join(
        Project, ComplianceReport.project_id == Project.id
    ).where(Project.organization_id == user.organization_id)

    total_reports = (
        await db.execute(select(func.count()).select_from(report_scope.subquery()))
    ).scalar() or 0

    avg_health = (
        await db.execute(
            select(func.avg(ComplianceReport.health_score))
            .join(Project, ComplianceReport.project_id == Project.id)
            .where(
                Project.organization_id == user.organization_id,
                ComplianceReport.health_score.is_not(None),
            )
        )
    ).scalar()

    critical_violations = (
        await db.execute(
            select(func.coalesce(func.sum(ComplianceReport.critical_count), 0))
            .join(Project, ComplianceReport.project_id == Project.id)
            .where(Project.organization_id == user.organization_id)
        )
    ).scalar() or 0

    day_ago = datetime.now(timezone.utc) - timedelta(days=1)
    recent_audit_events = (
        await db.execute(
            select(func.count())
            .select_from(AuditLog)
            .join(User, AuditLog.user_id == User.id)
            .where(
                User.organization_id == user.organization_id,
                AuditLog.created_at >= day_ago,
            )
        )
    ).scalar() or 0

    last_report_at = (
        await db.execute(
            select(func.max(ComplianceReport.created_at))
            .join(Project, ComplianceReport.project_id == Project.id)
            .where(Project.organization_id == user.organization_id)
        )
    ).scalar()

    document_counts = (
        await db.execute(
            select(
                UploadedDocument.processing_status,
                func.count(UploadedDocument.id).label("count"),
            )
            .join(Project, UploadedDocument.project_id == Project.id)
            .where(Project.organization_id == user.organization_id)
            .group_by(UploadedDocument.processing_status)
        )
    ).all()
    counts_by_status = {row.processing_status: int(row.count) for row in document_counts}
    total_documents = sum(counts_by_status.values())

    return APIResponse(
        data=AnalyticsSummaryOut(
            active_projects=int(active_projects),
            total_reports=int(total_reports),
            average_health_score=round(float(avg_health or 0.0), 2),
            critical_violations=int(critical_violations),
            recent_audit_events=int(recent_audit_events),
            last_report_at=last_report_at,
            total_documents=total_documents,
            pending_documents=counts_by_status.get("pending", 0),
            processing_documents=counts_by_status.get("processing", 0),
            completed_documents=counts_by_status.get("completed", 0),
            failed_documents=counts_by_status.get("failed", 0),
        ).model_dump(),
        meta=_meta(),
    )


@router.get("/history")
async def get_analytics_history(
    days: int = Query(14, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    bucket_expr = func.date_trunc("day", ComplianceReport.created_at)
    history_query = (
        select(
            bucket_expr.label("bucket_start"),
            func.avg(ComplianceReport.health_score).label("average_health_score"),
            func.count(ComplianceReport.id).label("reports_count"),
            func.coalesce(func.sum(ComplianceReport.critical_count), 0).label("critical_violations"),
        )
        .join(Project, ComplianceReport.project_id == Project.id)
        .where(
            Project.organization_id == user.organization_id,
            ComplianceReport.created_at >= cutoff,
            ComplianceReport.health_score.is_not(None),
        )
        .group_by(bucket_expr)
        .order_by(bucket_expr.asc())
    )

    rows = (await db.execute(history_query)).all()
    points = [
        AnalyticsHistoryPointOut(
            bucket_start=row.bucket_start,
            average_health_score=round(float(row.average_health_score or 0.0), 2),
            reports_count=int(row.reports_count or 0),
            critical_violations=int(row.critical_violations or 0),
        )
        for row in rows
    ]

    return APIResponse(
        data=AnalyticsHistoryOut(days=days, points=points).model_dump(),
        meta=_meta(),
    )


@router.get("/documents/trends")
async def get_document_metrics_trends(
    days: int = Query(14, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    upload_bucket = func.date_trunc("day", UploadedDocument.created_at)
    uploads_query = (
        select(upload_bucket.label("bucket_start"), func.count(UploadedDocument.id).label("uploaded_count"))
        .join(Project, UploadedDocument.project_id == Project.id)
        .where(
            Project.organization_id == user.organization_id,
            UploadedDocument.created_at >= cutoff,
        )
        .group_by(upload_bucket)
    )

    status_bucket = func.date_trunc("day", UploadedDocument.updated_at)
    status_query = (
        select(
            status_bucket.label("bucket_start"),
            func.sum(case((UploadedDocument.processing_status == "completed", 1), else_=0)).label("completed_count"),
            func.sum(case((UploadedDocument.processing_status == "failed", 1), else_=0)).label("failed_count"),
            func.sum(case((UploadedDocument.processing_status == "processing", 1), else_=0)).label("processing_count"),
        )
        .join(Project, UploadedDocument.project_id == Project.id)
        .where(
            Project.organization_id == user.organization_id,
            UploadedDocument.updated_at >= cutoff,
        )
        .group_by(status_bucket)
    )

    upload_rows = (await db.execute(uploads_query)).all()
    status_rows = (await db.execute(status_query)).all()

    points = _build_document_metrics_trend_points(upload_rows, status_rows)

    return APIResponse(
        data=DocumentMetricsTrendOut(days=days, points=points).model_dump(),
        meta=_meta(),
    )


@router.get("/ai-candidate-reviews")
async def get_ai_candidate_review_trend(
    days: int = Query(14, ge=1, le=90),
    project_id: UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    document_query = select(UploadedDocument).join(Project, UploadedDocument.project_id == Project.id).where(
        Project.organization_id == user.organization_id,
    )
    if project_id is not None:
        project = (
            await db.execute(
                select(Project).where(
                    Project.id == project_id,
                    Project.organization_id == user.organization_id,
                )
            )
        ).scalar_one_or_none()
        if not project:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Project not found"})
        document_query = document_query.where(UploadedDocument.project_id == project_id)

    documents = (await db.execute(document_query)).scalars().all()
    review_entries: list[dict[str, object]] = []
    for document in documents:
        extracted_data = document.extracted_data if isinstance(document.extracted_data, dict) else {}
        raw_reviews = extracted_data.get("ai_candidates_reviews")
        if not isinstance(raw_reviews, list):
            continue
        for review in raw_reviews:
            if isinstance(review, dict):
                review_entries.append(review)

    points, total_reviews, reviewed_documents, accepted_candidates, rejected_candidates, last_reviewed_at = _build_ai_candidate_review_trend_points(
        review_entries,
        cutoff,
    )
    total_candidates = accepted_candidates + rejected_candidates
    acceptance_rate_percent = None
    if total_candidates > 0:
        acceptance_rate_percent = round((accepted_candidates / total_candidates) * 100, 2)

    return APIResponse(
        data=AICandidateReviewTrendOut(
            days=days,
            project_id=project_id,
            total_reviews=total_reviews,
            reviewed_documents=reviewed_documents,
            accepted_candidates=accepted_candidates,
            rejected_candidates=rejected_candidates,
            acceptance_rate_percent=acceptance_rate_percent,
            last_reviewed_at=last_reviewed_at,
            points=points,
        ).model_dump(),
        meta=_meta(),
    )


@router.get("/worker-health")
async def get_worker_health(
    user: User = Depends(get_current_user),
):
    _ = user
    redis_status, redis_latency_ms = await _check_redis_health()
    celery_worker_count = await asyncio.to_thread(_inspect_celery_workers)
    worker_status = _derive_worker_status(redis_status, celery_worker_count)

    return APIResponse(
        data=WorkerHealthOut(
            queue_backend="celery",
            redis_status=redis_status,
            redis_latency_ms=redis_latency_ms,
            celery_worker_count=celery_worker_count,
            worker_status=worker_status,
            checked_at=datetime.now(timezone.utc),
        ).model_dump(),
        meta=_meta(),
    )


@router.get("/worker-ops")
async def get_worker_ops_hints(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project_documents = (
        await db.execute(
            select(UploadedDocument)
            .join(Project, UploadedDocument.project_id == Project.id)
            .where(Project.organization_id == user.organization_id)
        )
    ).scalars().all()
    last_replay_requested_at, last_replay_document_count = _get_latest_replay_activity(project_documents)

    redis_status, _ = await _check_redis_health()
    celery_worker_count = await asyncio.to_thread(_inspect_celery_workers)
    worker_status = _derive_worker_status(redis_status, celery_worker_count)

    recommended_actions = [
        "Keep one Celery worker online with the solo pool on Windows development hosts.",
        "Verify Redis broker connectivity before retrying failed background jobs.",
    ]
    if worker_status == "degraded":
        recommended_actions.append("Redis is healthy but workers are unavailable; restart Celery worker and monitor queue drain.")
    elif worker_status == "down":
        recommended_actions.append("Redis and workers are unreachable; restart Redis service, then backend and Celery worker.")
    else:
        recommended_actions.append("Worker pipeline is healthy; keep runtime checks active during document batch processing.")

    runbook_commands = [
        WorkerOpsCommandOut(
            label="Start backend",
            command=(
                "Set-Location 'c:/Users/IDEAPAD/Documents/GitHub/AGC/backend'; "
                "c:/Users/IDEAPAD/Documents/GitHub/AGC/.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
            ),
            when_to_use="API unavailable or after environment changes.",
        ),
        WorkerOpsCommandOut(
            label="Start Celery worker",
            command=(
                "Set-Location 'c:/Users/IDEAPAD/Documents/GitHub/AGC/backend'; "
                "c:/Users/IDEAPAD/Documents/GitHub/AGC/.venv/Scripts/python.exe -m celery -A app.core.celery_app:celery_app worker --loglevel=info --pool=solo"
            ),
            when_to_use="Background document jobs remain queued or workers are down.",
        ),
        WorkerOpsCommandOut(
            label="Start local services",
            command="Set-Location 'c:/Users/IDEAPAD/Documents/GitHub/AGC'; docker compose up -d postgres neo4j redis",
            when_to_use="Redis or dependency services are unavailable.",
        ),
    ]

    return APIResponse(
        data=WorkerOpsHintsOut(
            queue_backend="celery",
            worker_status=worker_status,
            recommended_actions=recommended_actions,
            runbook_commands=runbook_commands,
            last_replay_requested_at=last_replay_requested_at,
            last_replay_document_count=last_replay_document_count,
            checked_at=datetime.now(timezone.utc),
        ).model_dump(),
        meta=_meta(),
    )


@router.post("/worker-actions/replay-retryable")
async def replay_retryable_failed_documents(
    request: WorkerReplayQueueRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("admin", "architect", "devops")),
    db: AsyncSession = Depends(get_db),
):
    project = (
        await db.execute(
            select(Project).where(
                Project.id == request.project_id,
                Project.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if not project:
        return APIResponse(
            data=WorkerReplayQueueOut(
                project_id=request.project_id,
                requested_limit=max(1, request.limit),
                queued_count=0,
                items=[],
                checked_at=datetime.now(timezone.utc),
            ).model_dump(),
            meta=_meta(),
        )

    limit = max(1, min(request.limit, 100))
    project_documents = (
        await db.execute(select(UploadedDocument).where(UploadedDocument.project_id == request.project_id))
    ).scalars().all()
    _raise_if_replay_rate_limited(_get_latest_replay_timestamp(project_documents))

    failed_docs = [document for document in project_documents if document.processing_status == "failed"][:limit]

    queued_items: list[WorkerReplayQueueItemOut] = []
    for document in failed_docs:
        extraction_data = dict(document.extracted_data) if isinstance(document.extracted_data, dict) else {}
        error_meta = extraction_data.get("error") if isinstance(extraction_data.get("error"), dict) else {}
        retryable = bool(error_meta.get("retryable"))
        if not retryable and not request.allow_non_retryable:
            continue

        dead_letter_meta = extraction_data.get("dead_letter") if isinstance(extraction_data.get("dead_letter"), dict) else {}
        replay_count = int(dead_letter_meta.get("replay_count", 0) or 0) + 1
        replay_requested_at = datetime.now(timezone.utc).isoformat()

        task_id = enqueue_document_processing(document.id)
        queue_backend = "celery"
        should_schedule_local_fallback = False
        if task_id is None:
            queue_backend = "fastapi-background"
            should_schedule_local_fallback = True

        extraction_data["job"] = {
            "mode": "background",
            "task_id": task_id,
            "queue_backend": queue_backend,
            "status": "queued",
            "queued_at": replay_requested_at,
            "replay": True,
            "trigger": "worker-actions-api",
        }
        extraction_data = append_extractor_history(
            extraction_data,
            {
                "event": "replay_queued",
                "trigger": "worker-actions-api",
                "processing_status": "processing",
                "queue_backend": queue_backend,
                "task_id": task_id,
                "request_id": None,
                "key_slot": None,
                "provider_attempts": None,
                "error_code": error_meta.get("code") if isinstance(error_meta, dict) else None,
                "retryable": retryable,
            },
        )
        extraction_data["dead_letter"] = {
            **dead_letter_meta,
            "retryable": retryable,
            "replay_count": replay_count,
            "last_replay_requested_at": replay_requested_at,
            "last_replay_requested_by": str(user.id),
        }

        document.extracted_data = extraction_data
        document.processing_status = "processing"
        document.updated_at = datetime.now(timezone.utc)

        if should_schedule_local_fallback:
            background_tasks.add_task(document_extraction.process_document_by_id, document.id)

        queued_items.append(
            WorkerReplayQueueItemOut(
                document_id=document.id,
                queue_backend=queue_backend,
                task_id=task_id,
                replay_count=replay_count,
            )
        )

    await db.commit()

    return APIResponse(
        data=WorkerReplayQueueOut(
            project_id=request.project_id,
            requested_limit=limit,
            queued_count=len(queued_items),
            items=queued_items,
            checked_at=datetime.now(timezone.utc),
        ).model_dump(),
        meta=_meta(),
    )
