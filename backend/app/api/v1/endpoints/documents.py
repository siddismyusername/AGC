"""Document upload and review endpoints for Phase 3 ingestion."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from celery.result import AsyncResult
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import Text, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.celery_app import celery_app
from app.core.database import get_db
from app.core.deps import require_roles
from app.core.responses import APIResponse, ResponseMeta, build_pagination
from app.models.document import DOCUMENT_FILE_TYPES, DOCUMENT_PROCESSING_STATUSES, UploadedDocument
from app.models.user import User
from app.schemas.document import (
    DocumentDeadLetterReplayRequest,
    DocumentExtractedDataUpdateRequest,
    DocumentOut,
    DocumentProcessingRequest,
    DocumentStatusUpdateRequest,
)
from app.services import document_extraction, document_intake, document_ocr
from app.services.extractor_diagnostics_history import append_extractor_history
from app.tasks.document_tasks import enqueue_document_processing

from app.api.v1.endpoints.analytics import _get_latest_replay_timestamp, _raise_if_replay_rate_limited

router = APIRouter(tags=["Documents"])


def _meta() -> ResponseMeta:
    return ResponseMeta(request_id=str(uuid4()), timestamp=datetime.now(timezone.utc))


@router.post("/projects/{project_id}/documents/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    project_id: UUID,
    file: UploadFile = File(...),
    file_type: str = Form(...),
    description: str | None = Form(None),
    user: User = Depends(require_roles("admin", "architect", "developer", "devops")),
    db: AsyncSession = Depends(get_db),
):
    if file_type not in DOCUMENT_FILE_TYPES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNPROCESSABLE_ENTITY", "message": "Invalid file_type"},
        )

    contents = await file.read()
    storage_key = f"projects/{project_id}/documents/{uuid4()}-{file.filename}"
    ocr_metadata = await document_ocr.extract_ocr_metadata(
        file_name=file.filename or "uploaded-file",
        file_type=file_type,
        content_type=file.content_type,
        contents=contents,
    )
    upload_intake = document_intake.build_upload_intake(
        file_name=file.filename or "uploaded-file",
        file_type=file_type,
        content_type=file.content_type,
        contents=contents,
        ocr_metadata=ocr_metadata,
    )
    document = UploadedDocument(
        project_id=project_id,
        file_name=file.filename or "uploaded-file",
        file_type=file_type,
        description=description,
        file_size_bytes=len(contents),
        content_type=file.content_type or "application/octet-stream",
        storage_key=storage_key,
        processing_status="pending",
        extracted_data={"upload_intake": upload_intake},
        created_by=user.id,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    return APIResponse(data=DocumentOut.model_validate(document).model_dump(), meta=_meta())


@router.get("/projects/{project_id}/documents")
async def list_documents(
    project_id: UUID,
    file_type: str | None = Query(None, pattern="^(text|diagram|pdf|markdown)$"),
    processing_status: str | None = Query(None, pattern="^(pending|processing|completed|failed)$"),
    search: str | None = Query(None, min_length=1, max_length=200),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(require_roles("admin", "architect", "developer", "devops", "viewer")),
    db: AsyncSession = Depends(get_db),
):
    filters = [UploadedDocument.project_id == project_id]
    if file_type:
        filters.append(UploadedDocument.file_type == file_type)
    if processing_status:
        filters.append(UploadedDocument.processing_status == processing_status)
    search_term = search.strip() if search else None
    if search_term:
        searchable_text = func.concat_ws(
            " ",
            UploadedDocument.file_name,
            UploadedDocument.description,
            cast(UploadedDocument.extracted_data, Text),
        )
        filters.append(
            func.to_tsvector("english", func.coalesce(searchable_text, "")).op("@@")(
                func.plainto_tsquery("english", search_term)
            )
        )

    count_q = select(func.count()).select_from(UploadedDocument).where(*filters)
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(UploadedDocument)
        .where(*filters)
        .order_by(UploadedDocument.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = (await db.execute(q)).scalars().all()

    return APIResponse(
        data=[DocumentOut.model_validate(row).model_dump() for row in rows],
        meta=_meta(),
        pagination=build_pagination(page, per_page, total),
    )


@router.get("/projects/{project_id}/documents/dead-letter")
async def list_dead_letter_documents(
    project_id: UUID,
    retryable_only: bool = Query(True),
    user: User = Depends(require_roles("admin", "architect", "devops", "viewer")),
    db: AsyncSession = Depends(get_db),
):
    _ = user
    q = (
        select(UploadedDocument)
        .where(
            UploadedDocument.project_id == project_id,
            UploadedDocument.processing_status == "failed",
        )
        .order_by(UploadedDocument.updated_at.desc())
    )
    rows = (await db.execute(q)).scalars().all()

    items = []
    for document in rows:
        extracted_data = document.extracted_data if isinstance(document.extracted_data, dict) else {}
        error_meta = extracted_data.get("error") if isinstance(extracted_data, dict) else None
        dead_letter_meta = extracted_data.get("dead_letter") if isinstance(extracted_data, dict) else None
        job_meta = extracted_data.get("job") if isinstance(extracted_data, dict) else None

        retryable = bool(error_meta.get("retryable")) if isinstance(error_meta, dict) else False
        if retryable_only and not retryable:
            continue

        failed_at = None
        if isinstance(dead_letter_meta, dict):
            failed_at = dead_letter_meta.get("failed_at")
        if failed_at is None and isinstance(job_meta, dict):
            failed_at = job_meta.get("failed_at")

        replay_count = 0
        if isinstance(dead_letter_meta, dict):
            replay_count = int(dead_letter_meta.get("replay_count", 0) or 0)

        items.append(
            {
                "document_id": str(document.id),
                "file_name": document.file_name,
                "retryable": retryable,
                "error_code": error_meta.get("code") if isinstance(error_meta, dict) else None,
                "error_message": error_meta.get("message") if isinstance(error_meta, dict) else None,
                "failed_at": failed_at,
                "replay_count": replay_count,
                "last_replay_requested_at": (
                    dead_letter_meta.get("last_replay_requested_at") if isinstance(dead_letter_meta, dict) else None
                ),
            }
        )

    return APIResponse(
        data={
            "project_id": str(project_id),
            "total": len(items),
            "items": items,
        },
        meta=_meta(),
    )


@router.get("/projects/{project_id}/documents/{doc_id}")
async def get_document(
    project_id: UUID,
    doc_id: UUID,
    user: User = Depends(require_roles("admin", "architect", "developer", "devops", "viewer")),
    db: AsyncSession = Depends(get_db),
):
    q = select(UploadedDocument).where(
        UploadedDocument.id == doc_id,
        UploadedDocument.project_id == project_id,
    )
    document = (await db.execute(q)).scalar_one_or_none()
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Document not found"})
    return APIResponse(data=DocumentOut.model_validate(document).model_dump(), meta=_meta())


@router.post("/projects/{project_id}/documents/{doc_id}/replay")
async def replay_document_from_dead_letter(
    project_id: UUID,
    doc_id: UUID,
    request: DocumentDeadLetterReplayRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("admin", "architect", "devops")),
    db: AsyncSession = Depends(get_db),
):
    q = select(UploadedDocument).where(
        UploadedDocument.id == doc_id,
        UploadedDocument.project_id == project_id,
    )
    document = (await db.execute(q)).scalar_one_or_none()
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Document not found"})

    if document.processing_status != "failed":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_STATE", "message": "Only failed documents can be replayed"},
        )

    project_documents = (
        await db.execute(select(UploadedDocument).where(UploadedDocument.project_id == project_id))
    ).scalars().all()
    _raise_if_replay_rate_limited(_get_latest_replay_timestamp(project_documents))

    extraction_data = dict(document.extracted_data) if isinstance(document.extracted_data, dict) else {}
    error_meta = extraction_data.get("error") if isinstance(extraction_data.get("error"), dict) else {}
    retryable = bool(error_meta.get("retryable"))
    if not retryable and not request.allow_non_retryable:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"code": "NON_RETRYABLE", "message": "Failure is marked non-retryable; set allow_non_retryable=true"},
        )

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
    }
    extraction_data = append_extractor_history(
        extraction_data,
        {
            "event": "replay_queued",
            "trigger": "document-replay-api",
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
    await db.commit()
    await db.refresh(document)

    if should_schedule_local_fallback:
        background_tasks.add_task(document_extraction.process_document_by_id, document.id)

    return APIResponse(
        data={
            "document_id": str(document.id),
            "processing_status": document.processing_status,
            "task_id": task_id,
            "queue_backend": queue_backend,
            "replay_count": replay_count,
            "message": "Document replay queued",
        },
        meta=_meta(),
    )


# Valid status transitions:
# pending -> processing, failed
# processing -> completed, failed
# completed -> (terminal)
# failed -> (terminal)
_VALID_TRANSITIONS = {
    "pending": {"processing", "failed"},
    "processing": {"completed", "failed"},
    "completed": set(),
    "failed": set(),
}


@router.patch("/projects/{project_id}/documents/{doc_id}/status")
async def update_document_status(
    project_id: UUID,
    doc_id: UUID,
    request: DocumentStatusUpdateRequest,
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    q = select(UploadedDocument).where(
        UploadedDocument.id == doc_id,
        UploadedDocument.project_id == project_id,
    )
    document = (await db.execute(q)).scalar_one_or_none()
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Document not found"})

    # Validate state transition
    current_status = document.processing_status
    new_status = request.new_status
    if new_status not in _VALID_TRANSITIONS.get(current_status, set()):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "code": "INVALID_TRANSITION",
                "message": f"Cannot transition from '{current_status}' to '{new_status}'",
            },
        )

    document.processing_status = new_status
    document.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(document)

    return APIResponse(data=DocumentOut.model_validate(document).model_dump(), meta=_meta())


@router.patch("/projects/{project_id}/documents/{doc_id}/extracted-data")
async def update_document_extracted_data(
    project_id: UUID,
    doc_id: UUID,
    request: DocumentExtractedDataUpdateRequest,
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    q = select(UploadedDocument).where(
        UploadedDocument.id == doc_id,
        UploadedDocument.project_id == project_id,
    )
    document = (await db.execute(q)).scalar_one_or_none()
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Document not found"})

    document.extracted_data = request.extracted_data
    document.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(document)

    return APIResponse(data=DocumentOut.model_validate(document).model_dump(), meta=_meta())


@router.post("/projects/{project_id}/documents/{doc_id}/process")
async def process_document(
    project_id: UUID,
    doc_id: UUID,
    request: DocumentProcessingRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles("admin", "architect", "devops")),
    db: AsyncSession = Depends(get_db),
):
    q = select(UploadedDocument).where(
        UploadedDocument.id == doc_id,
        UploadedDocument.project_id == project_id,
    )
    document = (await db.execute(q)).scalar_one_or_none()
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Document not found"})

    if document.processing_status == "processing" and not request.force:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_STATE", "message": "Document is already processing"},
        )
    if document.processing_status in {"completed", "failed"} and not request.force:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_STATE", "message": "Document is terminal; set force=true to reprocess"},
        )

    document.processing_status = "processing"
    document.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(document)

    if request.mode == "background":
        queued_at = datetime.now(timezone.utc).isoformat()
        task_id = enqueue_document_processing(document.id)
        queue_backend = "celery"
        should_schedule_local_fallback = False
        if task_id is None:
            # Keep feature available when Celery broker is unreachable.
            queue_backend = "fastapi-background"
            should_schedule_local_fallback = True

        extraction_data = dict(document.extracted_data) if isinstance(document.extracted_data, dict) else {}
        extraction_data["job"] = {
            "mode": "background",
            "task_id": task_id,
            "queue_backend": queue_backend,
            "status": "queued",
            "queued_at": queued_at,
        }
        extraction_data = append_extractor_history(
            extraction_data,
            {
                "event": "processing_queued",
                "trigger": "document-process-api",
                "processing_status": "processing",
                "queue_backend": queue_backend,
                "task_id": task_id,
                "request_id": None,
                "key_slot": None,
                "provider_attempts": None,
                "error_code": None,
                "retryable": None,
            },
        )
        document.extracted_data = extraction_data
        document.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(document)

        if should_schedule_local_fallback:
            background_tasks.add_task(document_extraction.process_document_by_id, document.id)

        return APIResponse(
            data={
                "document_id": str(document.id),
                "processing_status": "processing",
                "task_id": task_id,
                "queue_backend": queue_backend,
                "message": "Document processing started",
            },
            meta=_meta(),
        )

    processed_document = await document_extraction.process_document_inline(db, document)
    return APIResponse(data=DocumentOut.model_validate(processed_document).model_dump(), meta=_meta())


@router.get("/projects/{project_id}/documents/{doc_id}/job")
async def get_document_job_status(
    project_id: UUID,
    doc_id: UUID,
    user: User = Depends(require_roles("admin", "architect", "developer", "devops", "viewer")),
    db: AsyncSession = Depends(get_db),
):
    q = select(UploadedDocument).where(
        UploadedDocument.id == doc_id,
        UploadedDocument.project_id == project_id,
    )
    document = (await db.execute(q)).scalar_one_or_none()
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Document not found"})

    extracted_data = document.extracted_data if isinstance(document.extracted_data, dict) else {}
    job_meta = extracted_data.get("job") if isinstance(extracted_data, dict) else None
    if not isinstance(job_meta, dict):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "JOB_NOT_FOUND", "message": "No job metadata found"})

    runtime_state = None
    task_id = job_meta.get("task_id")
    if task_id and job_meta.get("queue_backend") == "celery":
        try:
            runtime_state = AsyncResult(task_id, app=celery_app).state
        except Exception:
            runtime_state = "UNAVAILABLE"

    provider_meta = extracted_data.get("provider") if isinstance(extracted_data.get("provider"), dict) else {}
    error_meta = extracted_data.get("error") if isinstance(extracted_data.get("error"), dict) else {}
    error_details = error_meta.get("details") if isinstance(error_meta.get("details"), dict) else {}

    extractor_diagnostics = {
        "provider_name": provider_meta.get("name"),
        "provider_endpoint": provider_meta.get("endpoint"),
        "provider_attempts": provider_meta.get("attempts"),
        "request_id": provider_meta.get("request_id") or error_details.get("request_id"),
        "key_slot": provider_meta.get("key_slot") or error_details.get("key_slot"),
        "error_code": error_meta.get("code"),
    }
    diagnostics_history_raw = extracted_data.get("extractor_diagnostics_history") if isinstance(extracted_data, dict) else None
    diagnostics_history = [
        item for item in diagnostics_history_raw if isinstance(item, dict)
    ] if isinstance(diagnostics_history_raw, list) else []

    return APIResponse(
        data={
            "document_id": str(document.id),
            "processing_status": document.processing_status,
            "job": job_meta,
            "runtime_state": runtime_state,
            "extractor_diagnostics": extractor_diagnostics,
            "extractor_diagnostics_history": diagnostics_history,
            "updated_at": document.updated_at.isoformat() if document.updated_at else None,
        },
        meta=_meta(),
    )


@router.delete("/projects/{project_id}/documents/{doc_id}")
async def delete_document(
    project_id: UUID,
    doc_id: UUID,
    user: User = Depends(require_roles("admin", "architect")),
    db: AsyncSession = Depends(get_db),
):
    q = select(UploadedDocument).where(
        UploadedDocument.id == doc_id,
        UploadedDocument.project_id == project_id,
    )
    document = (await db.execute(q)).scalar_one_or_none()
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Document not found"})
    await db.delete(document)
    await db.commit()
    return APIResponse(data={"message": "Document deleted"}, meta=_meta())