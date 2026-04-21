from __future__ import annotations

import httpx
import pytest

from app.services import document_ocr


class _FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _FakeAsyncClient:
    def __init__(self, outcomes):
        self._outcomes = outcomes

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, json, headers):
        if not self._outcomes:
            raise AssertionError("No more outcomes configured")
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.mark.asyncio
async def test_extract_ocr_metadata_returns_none_when_disabled(monkeypatch):
    monkeypatch.setattr(document_ocr.settings, "DOCUMENT_OCR_PROVIDER", "disabled")

    payload = await document_ocr.extract_ocr_metadata(
        file_name="diagram.png",
        file_type="diagram",
        content_type="image/png",
        contents=b"\x89PNG\r\n\x1a\nmock",
    )

    assert payload is None


@pytest.mark.asyncio
async def test_extract_ocr_metadata_uses_http_provider(monkeypatch):
    outcomes = [_FakeResponse(200, {"text_preview": "Gateway talks to service", "confidence": 0.75, "model": "ocr-v1"})]

    monkeypatch.setattr(document_ocr.settings, "DOCUMENT_OCR_PROVIDER", "http")
    monkeypatch.setattr(document_ocr.settings, "DOCUMENT_OCR_HTTP_URL", "https://ocr.local/extract")
    monkeypatch.setattr(document_ocr.settings, "DOCUMENT_OCR_HTTP_MAX_BYTES", 1024)
    monkeypatch.setattr(document_ocr.httpx, "AsyncClient", lambda timeout: _FakeAsyncClient(outcomes))

    payload = await document_ocr.extract_ocr_metadata(
        file_name="diagram.png",
        file_type="diagram",
        content_type="image/png",
        contents=b"\x89PNG\r\n\x1a\nmock",
    )

    assert payload is not None
    assert payload["provider"] == "http-ocr"
    assert payload["text_preview"].startswith("Gateway")
    assert payload["confidence"] == 0.75
    assert payload["model"] == "ocr-v1"


@pytest.mark.asyncio
async def test_extract_ocr_metadata_handles_http_error(monkeypatch):
    outcomes = [httpx.ReadTimeout("timed out", request=httpx.Request("POST", "https://ocr.local/extract"))]

    monkeypatch.setattr(document_ocr.settings, "DOCUMENT_OCR_PROVIDER", "http")
    monkeypatch.setattr(document_ocr.settings, "DOCUMENT_OCR_HTTP_URL", "https://ocr.local/extract")
    monkeypatch.setattr(document_ocr.httpx, "AsyncClient", lambda timeout: _FakeAsyncClient(outcomes))

    payload = await document_ocr.extract_ocr_metadata(
        file_name="diagram.png",
        file_type="diagram",
        content_type="image/png",
        contents=b"\x89PNG\r\n\x1a\nmock",
    )

    assert payload is None


@pytest.mark.asyncio
async def test_extract_ocr_metadata_auto_uses_http_when_url_configured(monkeypatch):
    outcomes = [_FakeResponse(200, {"text_preview": "Gateway talks to service"})]

    monkeypatch.setattr(document_ocr.settings, "DOCUMENT_OCR_PROVIDER", "auto")
    monkeypatch.setattr(document_ocr.settings, "DOCUMENT_OCR_HTTP_URL", "https://ocr.local/extract")
    monkeypatch.setattr(document_ocr.httpx, "AsyncClient", lambda timeout: _FakeAsyncClient(outcomes))

    payload = await document_ocr.extract_ocr_metadata(
        file_name="diagram.png",
        file_type="diagram",
        content_type="image/png",
        contents=b"\x89PNG\r\n\x1a\nmock",
    )

    assert payload is not None
    assert payload["provider"] == "http-ocr"


@pytest.mark.asyncio
async def test_extract_ocr_metadata_auto_returns_none_without_http_url(monkeypatch):
    monkeypatch.setattr(document_ocr.settings, "DOCUMENT_OCR_PROVIDER", "auto")
    monkeypatch.setattr(document_ocr.settings, "DOCUMENT_OCR_HTTP_URL", None)

    payload = await document_ocr.extract_ocr_metadata(
        file_name="diagram.png",
        file_type="diagram",
        content_type="image/png",
        contents=b"\x89PNG\r\n\x1a\nmock",
    )

    assert payload is None
