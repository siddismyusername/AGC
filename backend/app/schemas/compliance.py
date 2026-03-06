from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Compliance Check Request ──

class ComplianceCheckRequest(BaseModel):
    commit_hash: str = Field(min_length=7, max_length=40)
    branch: str = "main"
    architecture_version_id: Optional[UUID] = None  # uses active version if None
    trigger: str = Field("manual", pattern="^(manual|ci_cd|scheduled)$")
    options: Optional[ComplianceOptions] = None


class ComplianceOptions(BaseModel):
    fail_on_critical: bool = True
    fail_on_major: bool = False
    skip_cycle_detection: bool = False
    auto_analyze: bool = True


# Fix forward reference
ComplianceCheckRequest.model_rebuild()


# ── Analysis Request ──

class AnalysisRequest(BaseModel):
    architecture_version_id: UUID
    repository_path: str = Field(min_length=1, description="Local path to the repository to analyze")
    commit_hash: str = Field(min_length=7, max_length=40)
    branch: str = "main"
    repository_url: Optional[str] = None
    analysis_scope: str = "full"
    options: Optional[AnalysisOptions] = None


class AnalysisOptions(BaseModel):
    include_patterns: list[str] = ["**/*.py"]
    exclude_patterns: list[str] = ["**/tests/**", "**/migrations/**"]
    max_depth: int = 10


# Fix forward reference
AnalysisRequest.model_rebuild()


# ── Response Schemas ──

class ComplianceReportOut(BaseModel):
    id: UUID
    project_id: UUID
    architecture_version_id: UUID
    commit_hash: Optional[str]
    branch: Optional[str]
    trigger: str
    status: str
    health_score: Optional[float]
    total_violations: int
    critical_count: int
    major_count: int
    minor_count: int
    execution_time_ms: Optional[int]
    summary: Optional[dict]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class ViolationOut(BaseModel):
    id: UUID
    compliance_report_id: UUID
    rule_id: Optional[UUID]
    violation_type: str
    severity: str
    source_component: str
    target_component: Optional[str]
    source_file: Optional[str]
    source_line: Optional[int]
    description: str
    suggestion: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class HealthScoreOut(BaseModel):
    health_score: Optional[float] = None
    total_violations: int = 0
    critical_count: int = 0
    major_count: int = 0
    minor_count: int = 0
    info_count: int = 0
    report_id: Optional[UUID] = None
    checked_at: Optional[datetime] = None


# ── Pipeline Schemas ──

class PipelineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    provider: str = Field(..., pattern="^(github_actions|gitlab_ci|jenkins|custom)$")
    config: dict = {}


class PipelineOut(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    provider: str
    webhook_url: Optional[str] = None
    webhook_secret: str
    is_active: bool
    config: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class CiCdTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    permissions: list[str] = ["compliance:trigger", "reports:read"]
    expires_at: Optional[datetime] = None


class CiCdTokenOut(BaseModel):
    id: UUID
    name: str
    token: Optional[str] = None  # only returned on creation
    permissions: list
    expires_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
