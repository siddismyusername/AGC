import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Boolean, Float, Integer, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

REPORT_STATUSES = ("pending", "running", "passed", "failed", "error")
TRIGGER_TYPES = ("manual", "ci_cd", "scheduled")
VIOLATION_TYPES = ("forbidden_dependency", "missing_dependency", "layer_skip", "cycle", "naming_violation", "unauthorized_access")
SEVERITY_LEVELS = ("critical", "major", "minor")
CI_PROVIDERS = ("github_actions", "gitlab_ci", "jenkins", "custom")


class ComplianceReport(Base):
    __tablename__ = "compliance_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    architecture_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("architecture_versions.id"), nullable=False
    )
    pipeline_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("pipelines.id"), nullable=True)
    commit_hash: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trigger: Mapped[str] = mapped_column(
        SAEnum(*TRIGGER_TYPES, name="trigger_type", create_constraint=True), nullable=False, default="manual"
    )
    status: Mapped[str] = mapped_column(
        SAEnum(*REPORT_STATUSES, name="report_status", create_constraint=True), nullable=False, default="pending"
    )
    health_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_violations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    critical_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    major_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    minor_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    execution_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    summary: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="compliance_reports")
    violations = relationship("Violation", back_populates="compliance_report", cascade="all, delete-orphan")


class Violation(Base):
    __tablename__ = "violations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    compliance_report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("compliance_reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("architecture_rules.id"), nullable=True)
    violation_type: Mapped[str] = mapped_column(
        SAEnum(*VIOLATION_TYPES, name="violation_type", create_constraint=True), nullable=False
    )
    severity: Mapped[str] = mapped_column(
        SAEnum(*SEVERITY_LEVELS, name="severity_level", create_constraint=True, create_type=False), nullable=False
    )
    source_component: Mapped[str] = mapped_column(String(255), nullable=False)
    target_component: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_file: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    source_line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    suggestion: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    compliance_report = relationship("ComplianceReport", back_populates="violations")


class Pipeline(Base):
    __tablename__ = "pipelines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(
        SAEnum(*CI_PROVIDERS, name="ci_provider", create_constraint=True), nullable=False
    )
    webhook_secret: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    config: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="pipelines")


class CiCdToken(Base):
    __tablename__ = "ci_cd_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    permissions: Mapped[list | None] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
