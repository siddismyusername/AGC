"""Celery tasks for document processing orchestration."""
from __future__ import annotations

import asyncio
from uuid import UUID

from celery.exceptions import CeleryError

from app.core.celery_app import celery_app
from app.services import document_extraction


@celery_app.task(name="app.tasks.document.process_document")
def process_document_task(document_id: str) -> None:
    asyncio.run(document_extraction.process_document_by_id(UUID(document_id)))


def enqueue_document_processing(document_id: UUID) -> str | None:
    """Submit background extraction to Celery and return task id when available."""
    try:
        task = process_document_task.delay(str(document_id))
        return task.id
    except (CeleryError, OSError):
        # Keep API behavior resilient when broker/worker is unavailable.
        return None
