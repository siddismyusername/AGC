"""Document extraction service scaffolding for Phase 4 integration."""
from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import httpx
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.document import UploadedDocument
from app.services.extractor_diagnostics_history import append_extractor_history


class ExtractorError(RuntimeError):
    def __init__(self, code: str, message: str, *, retryable: bool, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.details = details or {}


class ExtractedRuleCandidate(BaseModel):
    rule_text: str
    rule_type: str
    source_component: str | None = None
    target_component: str | None = None
    severity: str = "major"
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    model_version: str | None = None

    model_config = {"protected_namespaces": ()}


class ExtractedEntityCandidate(BaseModel):
    text: str
    label: str
    start: int | None = None
    end: int | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

    model_config = {"protected_namespaces": ()}


class ExtractedRelationshipCandidate(BaseModel):
    source: str
    target: str
    relation: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

    model_config = {"protected_namespaces": ()}


class DiagramComponentCandidate(BaseModel):
    label: str
    component_type: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

    model_config = {"protected_namespaces": ()}


class DiagramRelationshipCandidate(BaseModel):
    source: str
    target: str
    relation_type: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

    model_config = {"protected_namespaces": ()}


class ExtractorHttpResponse(BaseModel):
    summary: str
    keywords: list[str] = []
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    extracted_rules: list[ExtractedRuleCandidate] = []
    entities: list[ExtractedEntityCandidate] = []
    relationships: list[ExtractedRelationshipCandidate] = []
    detected_components: list[DiagramComponentCandidate] = []
    detected_relationships: list[DiagramRelationshipCandidate] = []
    processing_time_ms: int | None = Field(default=None, ge=0)
    model_info: dict[str, Any] | None = None

    model_config = {"protected_namespaces": ()}


def _backoff_seconds(attempt: int) -> float:
    base = settings.DOCUMENT_EXTRACTOR_HTTP_RETRY_BACKOFF_SECONDS
    max_backoff = settings.DOCUMENT_EXTRACTOR_HTTP_RETRY_MAX_BACKOFF_SECONDS
    return min(max_backoff, base * (2 ** max(0, attempt - 1)))


def _to_extractor_error(exc: Exception) -> ExtractorError:
    if isinstance(exc, ExtractorError):
        return exc
    return ExtractorError(
        "EXTRACTOR_UNHANDLED",
        str(exc),
        retryable=False,
    )


def _normalize_http_payload(provider_payload: dict[str, Any], *, endpoint: str, attempts: int) -> dict[str, Any]:
    try:
        parsed = ExtractorHttpResponse.model_validate(provider_payload)
    except ValidationError as exc:
        raise ExtractorError(
            "EXTRACTOR_INVALID_RESPONSE",
            "Extractor response does not match required schema",
            retryable=False,
            details={"validation_errors": exc.errors()},
        ) from exc

    if not parsed.summary.strip():
        raise ExtractorError(
            "EXTRACTOR_INVALID_RESPONSE",
            "Extractor response missing non-empty 'summary'",
            retryable=False,
        )

    rule_candidates = [rule.model_dump() for rule in parsed.extracted_rules]
    entity_candidates = [entity.model_dump() for entity in parsed.entities]
    relationship_candidates = [relationship.model_dump() for relationship in parsed.relationships]

    for component in parsed.detected_components:
        entity_candidates.append(
            {
                "text": component.label,
                "label": f"COMPONENT:{component.component_type}",
                "confidence": component.confidence,
            }
        )

    for relationship in parsed.detected_relationships:
        relationship_candidates.append(
            {
                "source": relationship.source,
                "target": relationship.target,
                "relation": relationship.relation_type,
                "confidence": relationship.confidence,
            }
        )

    extracted: dict[str, Any] = {
        "summary": parsed.summary.strip(),
        "keywords": sorted({keyword.strip().lower() for keyword in parsed.keywords if keyword.strip()}),
        "rule_candidates": rule_candidates,
        "entity_candidates": entity_candidates,
        "relationship_candidates": relationship_candidates,
        "source": "http-extractor",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "provider": {
            "name": "http",
            "endpoint": endpoint,
            "attempts": attempts,
        },
    }
    if parsed.confidence is not None:
        extracted["confidence"] = parsed.confidence
    if parsed.processing_time_ms is not None:
        extracted["processing_time_ms"] = parsed.processing_time_ms
    if parsed.model_info is not None:
        extracted["model_info"] = parsed.model_info
    return extracted


def _build_auth_header(api_key: str) -> tuple[str, str]:
    header_name = settings.DOCUMENT_EXTRACTOR_HTTP_API_KEY_HEADER.strip() or "Authorization"
    scheme = settings.DOCUMENT_EXTRACTOR_HTTP_API_KEY_SCHEME.strip()
    if header_name.lower() == "authorization":
        return header_name, f"{scheme} {api_key}".strip() if scheme else api_key
    return header_name, api_key


def _auth_key_chain() -> list[tuple[str, str]]:
    keys: list[tuple[str, str]] = []
    if settings.DOCUMENT_EXTRACTOR_HTTP_API_KEY:
        keys.append(("primary", settings.DOCUMENT_EXTRACTOR_HTTP_API_KEY))
    if settings.DOCUMENT_EXTRACTOR_HTTP_API_KEY_SECONDARY:
        secondary = settings.DOCUMENT_EXTRACTOR_HTTP_API_KEY_SECONDARY
        if not keys or secondary != keys[0][1]:
            keys.append(("secondary", secondary))
    return keys


def _build_extracted_payload(document: UploadedDocument) -> dict[str, Any]:
    """Create deterministic extraction output until OCR/NLP jobs are wired."""
    description = (document.description or "").strip()
    summary = f"Extracted dependency graph intent from {document.file_name}."
    if description:
        summary = f"{summary} {description}"

    keywords = [
        "dependency",
        "graph",
        document.file_type,
        *(token.lower() for token in document.file_name.replace(".", " ").split()[:4]),
    ]

    return {
        "summary": summary,
        "keywords": sorted(set(keywords)),
        "source": "scaffolded-inline-extractor",
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }


class ExtractionProvider(ABC):
    @abstractmethod
    async def extract(self, document: UploadedDocument) -> dict[str, Any]:
        raise NotImplementedError


class OllamaTextExtractionProvider(ExtractionProvider):
    async def extract(self, document: UploadedDocument) -> dict[str, Any]:
        # Wait until the document content is fetched from storage.
        # Since this file operates on the UploadedDocument metadata, we assume text
        # was already loaded or this expects text from `document.description`.
        # Real-world usage requires reading the file bytes, assuming description for now.
        from app.services.ai_extraction import analyze_text
        text_content = document.description or document.file_name
        # Note: A true storage integration would read the S3/Local file here.
        
        result = await analyze_text(text_content)
        
        return {
            "summary": result["summary"],
            "keywords": result["keywords"],
            "rule_candidates": result["rule_candidates"],
            "entity_candidates": result["entity_candidates"],
            "relationship_candidates": result["relationship_candidates"],
            "source": "ollama-local-extractor",
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "provider": {
                "name": "ollama",
                "model": settings.OLLAMA_TEXT_MODEL,
                "attempts": 1,
            },
        }

def _resolve_provider() -> ExtractionProvider:
    provider_name = settings.DOCUMENT_EXTRACTOR_PROVIDER.lower().strip()
    if provider_name in {"disabled", "none", "off"}:
        return ScaffoldedExtractionProvider() # Fallback
    return OllamaTextExtractionProvider()


async def process_document_inline(db: AsyncSession, document: UploadedDocument) -> UploadedDocument:
    """Populate extracted_data and finalize processing status."""
    existing_data = document.extracted_data if isinstance(document.extracted_data, dict) else {}
    existing_job = existing_data.get("job") if isinstance(existing_data, dict) else None

    try:
        provider = _resolve_provider()
        payload = await provider.extract(document)
        merged_payload = dict(existing_data)
        merged_payload.update(payload)
        if isinstance(existing_job, dict):
            merged_payload["job"] = {
                **existing_job,
                "status": "completed",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        provider_meta = merged_payload.get("provider") if isinstance(merged_payload.get("provider"), dict) else {}
        merged_payload = append_extractor_history(
            merged_payload,
            {
                "event": "processing_completed",
                "processing_status": "completed",
                "queue_backend": existing_job.get("queue_backend") if isinstance(existing_job, dict) else None,
                "task_id": existing_job.get("task_id") if isinstance(existing_job, dict) else None,
                "request_id": provider_meta.get("request_id"),
                "key_slot": provider_meta.get("key_slot"),
                "provider_attempts": provider_meta.get("attempts"),
                "error_code": None,
                "retryable": None,
            },
        )
        document.extracted_data = merged_payload
        document.processing_status = "completed"
    except Exception as exc:  # pragma: no cover - defensive for future extractor errors
        extractor_error = _to_extractor_error(exc)
        document.processing_status = "failed"
        failure_timestamp = datetime.now(timezone.utc).isoformat()
        existing_dead_letter = existing_data.get("dead_letter") if isinstance(existing_data, dict) else None
        replay_count = int(existing_dead_letter.get("replay_count", 0) or 0) if isinstance(existing_dead_letter, dict) else 0
        failed_payload = {
            **existing_data,
            "source": "document-extractor",
            "error": {
                "code": extractor_error.code,
                "message": str(extractor_error),
                "retryable": extractor_error.retryable,
                "details": extractor_error.details,
            },
            "dead_letter": {
                "retryable": extractor_error.retryable,
                "failed_at": failure_timestamp,
                "replay_count": replay_count,
                "status": "ready_for_replay" if extractor_error.retryable else "manual_inspection_required",
            },
            "processed_at": failure_timestamp,
        }
        if isinstance(existing_job, dict):
            failed_payload["job"] = {
                **existing_job,
                "status": "failed",
                "failed_at": failure_timestamp,
                "retry_hint": "reprocess" if extractor_error.retryable else "inspect-extractor-config",
            }
        failed_payload = append_extractor_history(
            failed_payload,
            {
                "event": "processing_failed",
                "processing_status": "failed",
                "queue_backend": existing_job.get("queue_backend") if isinstance(existing_job, dict) else None,
                "task_id": existing_job.get("task_id") if isinstance(existing_job, dict) else None,
                "request_id": extractor_error.details.get("request_id") if isinstance(extractor_error.details, dict) else None,
                "key_slot": extractor_error.details.get("key_slot") if isinstance(extractor_error.details, dict) else None,
                "provider_attempts": extractor_error.details.get("attempt") if isinstance(extractor_error.details, dict) else None,
                "error_code": extractor_error.code,
                "retryable": extractor_error.retryable,
            },
        )
        document.extracted_data = failed_payload
    document.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(document)
    return document


async def process_document_by_id(document_id: UUID) -> None:
    """Background-task entrypoint for future queue-driven processing."""
    async with AsyncSessionLocal() as db:
        document = await db.get(UploadedDocument, document_id)
        if not document:
            return
        await process_document_inline(db, document)
