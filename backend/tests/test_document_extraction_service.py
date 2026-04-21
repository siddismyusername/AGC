from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest

from app.services import document_extraction
from app.services.document_extraction import ExtractorError, HttpExtractionProvider


class _FakeResponse:
	def __init__(self, status_code: int, payload):
		self.status_code = status_code
		self._payload = payload

	def json(self):
		return self._payload


class _FakeAsyncClient:
	def __init__(self, outcomes):
		self._outcomes = outcomes
		self.calls = []

	async def __aenter__(self):
		return self

	async def __aexit__(self, exc_type, exc, tb):
		return False

	async def post(self, url, json, headers):
		self.calls.append({"url": url, "json": json, "headers": headers})
		if not self._outcomes:
			raise AssertionError("No more outcomes configured")
		outcome = self._outcomes.pop(0)
		if isinstance(outcome, Exception):
			raise outcome
		return outcome


class _FakeDbSession:
	def __init__(self):
		self.committed = 0
		self.refreshed = 0

	async def commit(self):
		self.committed += 1

	async def refresh(self, document):
		self.refreshed += 1


def _build_document():
	return SimpleNamespace(
		id=uuid4(),
		project_id=uuid4(),
		file_name="architecture.md",
		file_type="markdown",
		description="Layered architecture",
		storage_key="projects/test/doc-1",
		content_type="text/markdown",
		file_size_bytes=123,
		extracted_data=None,
		processing_status="processing",
		updated_at=None,
	)


@pytest.mark.asyncio
async def test_http_provider_retries_and_succeeds_on_timeout(monkeypatch):
	document = _build_document()
	outcomes = [
		httpx.ReadTimeout("timeout", request=httpx.Request("POST", "https://extractor.local")),
		_FakeResponse(200, {"summary": "Done", "keywords": ["api", "layer"]}),
	]

	async def _fake_sleep(seconds):
		return None

	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_URL", "https://extractor.local")
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_RETRY_ATTEMPTS", 3)
	monkeypatch.setattr(document_extraction.httpx, "AsyncClient", lambda timeout: _FakeAsyncClient(outcomes))
	monkeypatch.setattr(document_extraction.asyncio, "sleep", _fake_sleep)

	payload = await HttpExtractionProvider().extract(document)
	assert payload["source"] == "http-extractor"
	assert payload["provider"]["attempts"] == 2
	assert payload["summary"] == "Done"


@pytest.mark.asyncio
async def test_http_provider_raises_non_retryable_for_invalid_response(monkeypatch):
	document = _build_document()
	outcomes = [_FakeResponse(200, ["not-an-object"])]

	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_URL", "https://extractor.local")
	monkeypatch.setattr(document_extraction.httpx, "AsyncClient", lambda timeout: _FakeAsyncClient(outcomes))

	with pytest.raises(ExtractorError) as exc_info:
		await HttpExtractionProvider().extract(document)

	assert exc_info.value.code == "EXTRACTOR_INVALID_RESPONSE"
	assert exc_info.value.retryable is False


@pytest.mark.asyncio
async def test_process_document_inline_writes_structured_failure_metadata(monkeypatch):
	document = _build_document()
	document.extracted_data = {
		"job": {
			"mode": "background",
			"status": "queued",
			"queue_backend": "celery",
			"task_id": "task-123",
			"queued_at": "2026-04-18T00:00:00+00:00",
		}
	}

	class _FailingProvider:
		async def extract(self, document):
			raise ExtractorError(
				"EXTRACTOR_HTTP_TIMEOUT",
				"Extractor request timed out",
				retryable=True,
				details={"attempt": 3},
			)

	db = _FakeDbSession()
	monkeypatch.setattr(document_extraction, "_resolve_provider", lambda: _FailingProvider())

	updated = await document_extraction.process_document_inline(db, document)

	assert updated.processing_status == "failed"
	assert updated.extracted_data["error"]["code"] == "EXTRACTOR_HTTP_TIMEOUT"
	assert updated.extracted_data["error"]["retryable"] is True
	assert updated.extracted_data["job"]["status"] == "failed"
	assert updated.extracted_data["job"]["retry_hint"] == "reprocess"
	assert db.committed == 1
	assert db.refreshed == 1


@pytest.mark.asyncio
async def test_http_provider_normalizes_rules_entities_and_relationships(monkeypatch):
	document = _build_document()
	outcomes = [
		_FakeResponse(
			200,
			{
				"summary": "Architecture extracted",
				"keywords": ["Service", "Gateway", "service"],
				"extracted_rules": [
					{
						"rule_text": "Services must pass through gateway",
						"rule_type": "required_dependency",
						"source_component": "ServiceLayer",
						"target_component": "ApiGateway",
						"severity": "major",
						"confidence": 0.91,
					},
				],
				"entities": [
					{"text": "ServiceLayer", "label": "COMPONENT", "confidence": 0.95},
				],
				"relationships": [
					{
						"source": "ServiceLayer",
						"target": "ApiGateway",
						"relation": "depends_on",
						"confidence": 0.9,
					}
				],
				"model_info": {"name": "extractor-v2", "version": "2.0"},
				"processing_time_ms": 180,
			},
		)
	]

	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_URL", "https://extractor.local")
	monkeypatch.setattr(document_extraction.httpx, "AsyncClient", lambda timeout: _FakeAsyncClient(outcomes))

	payload = await HttpExtractionProvider().extract(document)
	assert payload["summary"] == "Architecture extracted"
	assert payload["keywords"] == ["gateway", "service"]
	assert len(payload["rule_candidates"]) == 1
	assert len(payload["entity_candidates"]) == 1
	assert len(payload["relationship_candidates"]) == 1
	assert payload["processing_time_ms"] == 180
	assert payload["model_info"]["name"] == "extractor-v2"


@pytest.mark.asyncio
async def test_http_provider_rejects_out_of_range_confidence(monkeypatch):
	document = _build_document()
	outcomes = [_FakeResponse(200, {"summary": "Done", "keywords": [], "confidence": 1.7})]

	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_URL", "https://extractor.local")
	monkeypatch.setattr(document_extraction.httpx, "AsyncClient", lambda timeout: _FakeAsyncClient(outcomes))

	with pytest.raises(ExtractorError) as exc_info:
		await HttpExtractionProvider().extract(document)

	assert exc_info.value.code == "EXTRACTOR_INVALID_RESPONSE"
	assert exc_info.value.retryable is False


@pytest.mark.asyncio
async def test_http_provider_rotates_to_secondary_api_key_on_unauthorized(monkeypatch):
	document = _build_document()
	outcomes = [
		_FakeResponse(401, {"error": "unauthorized"}),
		_FakeResponse(200, {"summary": "Recovered", "keywords": ["Auth"]}),
	]
	client = _FakeAsyncClient(outcomes)

	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_URL", "https://extractor.local")
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_API_KEY", "primary-token")
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_API_KEY_SECONDARY", "secondary-token")
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_API_KEY_HEADER", "Authorization")
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_API_KEY_SCHEME", "Bearer")
	monkeypatch.setattr(document_extraction.httpx, "AsyncClient", lambda timeout: client)

	payload = await HttpExtractionProvider().extract(document)

	assert payload["summary"] == "Recovered"
	assert payload["provider"]["attempts"] == 2
	assert payload["provider"]["key_slot"] == "secondary"
	assert payload["provider"]["request_id"]
	assert client.calls[0]["headers"]["Authorization"] == "Bearer primary-token"
	assert client.calls[1]["headers"]["Authorization"] == "Bearer secondary-token"


@pytest.mark.asyncio
async def test_http_provider_supports_custom_api_key_header(monkeypatch):
	document = _build_document()
	outcomes = [_FakeResponse(200, {"summary": "Done", "keywords": []})]
	client = _FakeAsyncClient(outcomes)

	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_URL", "https://extractor.local")
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_API_KEY", "raw-key")
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_API_KEY_SECONDARY", None)
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_API_KEY_HEADER", "x-api-key")
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_API_KEY_SCHEME", "")
	monkeypatch.setattr(document_extraction.httpx, "AsyncClient", lambda timeout: client)

	payload = await HttpExtractionProvider().extract(document)

	assert payload["summary"] == "Done"
	assert client.calls[0]["headers"]["x-api-key"] == "raw-key"
	assert "Authorization" not in client.calls[0]["headers"]


def test_resolve_provider_auto_uses_http_when_configured(monkeypatch):
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_PROVIDER", "auto")
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_URL", "https://extractor.local")

	provider = document_extraction._resolve_provider()
	assert isinstance(provider, document_extraction.HttpExtractionProvider)


def test_resolve_provider_auto_falls_back_to_scaffold_when_http_missing(monkeypatch):
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_PROVIDER", "auto")
	monkeypatch.setattr(document_extraction.settings, "DOCUMENT_EXTRACTOR_HTTP_URL", None)

	provider = document_extraction._resolve_provider()
	assert isinstance(provider, document_extraction.ScaffoldedExtractionProvider)
