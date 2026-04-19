"""phase 3 documents

Revision ID: 20260418_0001
Revises: 20260416_0001
Create Date: 2026-04-18 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260418_0001"
down_revision = "20260416_0001"
branch_labels = None
depends_on = None


document_file_type = postgresql.ENUM(
    "text", "diagram", "pdf", "markdown", name="document_file_type", create_type=False
)
document_processing_status = postgresql.ENUM(
    "pending", "processing", "completed", "failed", name="document_processing_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    document_file_type.create(bind, checkfirst=True)
    document_processing_status.create(bind, checkfirst=True)

    op.create_table(
        "uploaded_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_type", document_file_type, nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("processing_status", document_processing_status, nullable=False),
        sa.Column("extracted_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key", name="uq_uploaded_documents_storage_key"),
    )

    op.create_index("ix_uploaded_documents_project_id", "uploaded_documents", ["project_id"])
    op.create_index("ix_uploaded_documents_storage_key", "uploaded_documents", ["storage_key"])


def downgrade() -> None:
    op.drop_index("ix_uploaded_documents_storage_key", table_name="uploaded_documents")
    op.drop_index("ix_uploaded_documents_project_id", table_name="uploaded_documents")
    op.drop_table("uploaded_documents")

    bind = op.get_bind()
    document_processing_status.drop(bind, checkfirst=True)
    document_file_type.drop(bind, checkfirst=True)