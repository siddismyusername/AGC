from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AnalyticsSummaryOut(BaseModel):
    active_projects: int
    total_reports: int
    average_health_score: float
    critical_violations: int
    recent_audit_events: int
    last_report_at: datetime | None
    total_documents: int
    pending_documents: int
    processing_documents: int
    completed_documents: int
    failed_documents: int


class AnalyticsHistoryPointOut(BaseModel):
    bucket_start: datetime
    average_health_score: float
    reports_count: int
    critical_violations: int


class AnalyticsHistoryOut(BaseModel):
    days: int
    points: list[AnalyticsHistoryPointOut]


class DocumentMetricsTrendPointOut(BaseModel):
    bucket_start: datetime
    uploaded_count: int
    completed_count: int
    failed_count: int
    processing_count: int
    uploaded_delta_day_over_day: int
    completed_delta_day_over_day: int
    failed_delta_day_over_day: int
    processing_delta_day_over_day: int
    success_rate_percent: float | None
    failure_rate_percent: float | None


class DocumentMetricsTrendOut(BaseModel):
    days: int
    points: list[DocumentMetricsTrendPointOut]


class AICandidateReviewTrendPointOut(BaseModel):
    bucket_start: datetime
    review_count: int
    reviewed_documents: int
    accepted_candidates: int
    rejected_candidates: int
    acceptance_rate_percent: float | None


class AICandidateReviewTrendOut(BaseModel):
    days: int
    project_id: UUID | None = None
    total_reviews: int
    reviewed_documents: int
    accepted_candidates: int
    rejected_candidates: int
    acceptance_rate_percent: float | None
    last_reviewed_at: datetime | None
    points: list[AICandidateReviewTrendPointOut]


class WorkerHealthOut(BaseModel):
    queue_backend: str
    redis_status: str
    redis_latency_ms: float | None
    celery_worker_count: int
    worker_status: str
    checked_at: datetime


class WorkerOpsCommandOut(BaseModel):
    label: str
    command: str
    when_to_use: str


class WorkerOpsHintsOut(BaseModel):
    queue_backend: str
    worker_status: str
    recommended_actions: list[str]
    runbook_commands: list[WorkerOpsCommandOut]
    last_replay_requested_at: datetime | None
    last_replay_document_count: int
    checked_at: datetime


class WorkerReplayQueueRequest(BaseModel):
    project_id: UUID
    limit: int = 10
    allow_non_retryable: bool = False


class WorkerReplayQueueItemOut(BaseModel):
    document_id: UUID
    queue_backend: str
    task_id: str | None
    replay_count: int


class WorkerReplayQueueOut(BaseModel):
    project_id: UUID
    requested_limit: int
    queued_count: int
    items: list[WorkerReplayQueueItemOut]
    checked_at: datetime
