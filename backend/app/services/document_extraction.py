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


class ScaffoldedExtractionProvider(ExtractionProvider):
    async def extract(self, document: UploadedDocument) -> dict[str, Any]:
        return _build_extracted_payload(document)


class HttpExtractionProvider(ExtractionProvider):
    async def extract(self, document: UploadedDocument) -> dict[str, Any]:
        if not settings.DOCUMENT_EXTRACTOR_HTTP_URL:
            raise ExtractorError(
                "EXTRACTOR_CONFIG_MISSING",
                "DOCUMENT_EXTRACTOR_HTTP_URL is required for http extractor provider",
                retryable=False,
            )

        request_id = str(uuid4())
        base_headers: dict[str, str] = {
            "Content-Type": "application/json",
            "X-Request-ID": request_id,
            "X-ArchGuard-Document-ID": str(document.id),
            "X-ArchGuard-Project-ID": str(document.project_id),
            "Idempotency-Key": f"archguard-doc-{document.id}",
        }

        payload = {
            "document_id": str(document.id),
            "project_id": str(document.project_id),
            "file_name": document.file_name,
            "file_type": document.file_type,
            "description": document.description,
            "storage_key": document.storage_key,
            "content_type": document.content_type,
            "file_size_bytes": document.file_size_bytes,
        }

        auth_chain = _auth_key_chain()
        if not auth_chain:
            auth_chain = [("none", "")]

        max_attempts = max(1, settings.DOCUMENT_EXTRACTOR_HTTP_RETRY_ATTEMPTS)
        request_attempt = 0
        for key_slot, key_value in auth_chain:
            headers = dict(base_headers)
            if key_slot != "none":
                auth_header_name, auth_header_value = _build_auth_header(key_value)
                headers[auth_header_name] = auth_header_value

            for attempt in range(1, max_attempts + 1):
                request_attempt += 1
                try:
                    async with httpx.AsyncClient(timeout=settings.DOCUMENT_EXTRACTOR_HTTP_TIMEOUT_SECONDS) as client:
                        response = await client.post(settings.DOCUMENT_EXTRACTOR_HTTP_URL, json=payload, headers=headers)

                    if response.status_code in {401, 403}:
                        if key_slot == "primary" and any(slot == "secondary" for slot, _ in auth_chain):
                            break
                        raise ExtractorError(
                            f"EXTRACTOR_HTTP_{response.status_code}",
                            f"Extractor request rejected with status {response.status_code}",
                            retryable=False,
                            details={
                                "status_code": response.status_code,
                                "attempt": attempt,
                                "key_slot": key_slot,
                                "request_id": request_id,
                            },
                        )

                    if response.status_code == 429 or response.status_code >= 500:
                        raise ExtractorError(
                            f"EXTRACTOR_HTTP_{response.status_code}",
                            f"Extractor service unavailable with status {response.status_code}",
                            retryable=True,
                            details={
                                "status_code": response.status_code,
                                "attempt": attempt,
                                "key_slot": key_slot,
                                "request_id": request_id,
                            },
                        )

                    if response.status_code >= 400:
                        raise ExtractorError(
                            f"EXTRACTOR_HTTP_{response.status_code}",
                            f"Extractor request rejected with status {response.status_code}",
                            retryable=False,
                            details={
                                "status_code": response.status_code,
                                "attempt": attempt,
                                "key_slot": key_slot,
                                "request_id": request_id,
                            },
                        )

                    provider_payload = response.json()

                    if not isinstance(provider_payload, dict):
                        raise ExtractorError(
                            "EXTRACTOR_INVALID_RESPONSE",
                            "Extractor response must be a JSON object",
                            retryable=False,
                            details={"attempt": attempt, "key_slot": key_slot, "request_id": request_id},
                        )

                    normalized = _normalize_http_payload(
                        provider_payload,
                        endpoint=settings.DOCUMENT_EXTRACTOR_HTTP_URL,
                        attempts=request_attempt,
                    )
                    normalized["provider"]["request_id"] = request_id
                    normalized["provider"]["key_slot"] = key_slot
                    return normalized

                except httpx.TimeoutException as exc:
                    extractor_error = ExtractorError(
                        "EXTRACTOR_HTTP_TIMEOUT",
                        f"Extractor request timed out: {exc}",
                        retryable=True,
                        details={"attempt": attempt, "key_slot": key_slot, "request_id": request_id},
                    )
                except httpx.RequestError as exc:
                    extractor_error = ExtractorError(
                        "EXTRACTOR_HTTP_REQUEST_ERROR",
                        f"Extractor request failed: {exc}",
                        retryable=True,
                        details={"attempt": attempt, "key_slot": key_slot, "request_id": request_id},
                    )
                except ExtractorError as exc:
                    extractor_error = exc

                if not extractor_error.retryable or attempt == max_attempts:
                    raise extractor_error

                await asyncio.sleep(_backoff_seconds(attempt))

        raise ExtractorError(
            "EXTRACTOR_HTTP_RETRY_EXHAUSTED",
            "Extractor retries exhausted",
            retryable=True,
        )


def _resolve_provider() -> ExtractionProvider:
    provider_name = settings.DOCUMENT_EXTRACTOR_PROVIDER.lower().strip()
    if provider_name in {"scaffolded", "mock", "local"}:
        return ScaffoldedExtractionProvider()
    if provider_name == "http":
        return HttpExtractionProvider()
    raise RuntimeError(f"Unsupported DOCUMENT_EXTRACTOR_PROVIDER: {settings.DOCUMENT_EXTRACTOR_PROVIDER}")


async def process_document_inline(db: AsyncSession, document: UploadedDocument) -> UploadedDocument:
    """Populate extracted_data and finalize processing status."""
    existing_data = document.extracted_data if isinstance(document.extracted_data, dict) else {}
    existing_job = existing_data.get("job") if isinstance(existing_data, dict) else None

    try:
        provider = _resolve_provider()
        payload = await provider.extract(document)
        if isinstance(existing_job, dict):
            payload["job"] = {
                **existing_job,
                "status": "completed",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        document.extracted_data = payload
        document.processing_status = "completed"
    except Exception as exc:  # pragma: no cover - defensive for future extractor errors
        extractor_error = _to_extractor_error(exc)
        document.processing_status = "failed"
        failure_timestamp = datetime.now(timezone.utc).isoformat()
        existing_dead_letter = existing_data.get("dead_letter") if isinstance(existing_data, dict) else None
        replay_count = int(existing_dead_letter.get("replay_count", 0) or 0) if isinstance(existing_dead_letter, dict) else 0
        failed_payload = {
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
