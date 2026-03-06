import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Boolean, Float, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

RULE_TYPES = ("forbidden_dependency", "required_dependency", "layer_constraint", "cycle_prohibition", "naming_convention", "custom")
SEVERITY_LEVELS = ("critical", "major", "minor")


class ArchitectureRule(Base):
    __tablename__ = "architecture_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    architecture_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("architecture_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_text: Mapped[str] = mapped_column(Text, nullable=False)
    rule_type: Mapped[str] = mapped_column(
        SAEnum(*RULE_TYPES, name="rule_type", create_constraint=True), nullable=False
    )
    source_component: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_component: Mapped[str | None] = mapped_column(String(255), nullable=True)
    severity: Mapped[str] = mapped_column(
        SAEnum(*SEVERITY_LEVELS, name="severity_level", create_constraint=True), nullable=False, default="major"
    )
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    architecture_version = relationship("ArchitectureVersion", back_populates="rules")
