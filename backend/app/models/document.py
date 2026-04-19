import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, ForeignKey, Enum as SAEnum, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

DOCUMENT_FILE_TYPES = ("text", "diagram", "pdf", "markdown")
DOCUMENT_PROCESSING_STATUSES = ("pending", "processing", "completed", "failed")


class UploadedDocument(Base):
    __tablename__ = "uploaded_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(
        SAEnum(*DOCUMENT_FILE_TYPES, name="document_file_type", create_constraint=True), nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True, index=True)
    processing_status: Mapped[str] = mapped_column(
        SAEnum(*DOCUMENT_PROCESSING_STATUSES, name="document_processing_status", create_constraint=True),
        nullable=False,
        default="pending",
    )
    extracted_data: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    project = relationship("Project")
    created_user = relationship("User")