from __future__ import annotations

import base64
from typing import Any

import httpx

from app.core.config import settings


def _auth_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    if settings.DOCUMENT_OCR_HTTP_API_KEY:
        header_name = settings.DOCUMENT_OCR_HTTP_API_KEY_HEADER.strip() or "Authorization"
        scheme = settings.DOCUMENT_OCR_HTTP_API_KEY_SCHEME.strip()
        if header_name.lower() == "authorization":
            header_value = f"{scheme} {settings.DOCUMENT_OCR_HTTP_API_KEY}".strip() if scheme else settings.DOCUMENT_OCR_HTTP_API_KEY
        else:
            header_value = settings.DOCUMENT_OCR_HTTP_API_KEY
        headers[header_name] = header_value
    return headers


async def _extract_with_http(
    *,
    file_name: str,
    file_type: str,
    content_type: str | None,
    contents: bytes,
) -> dict[str, Any] | None:
    if not settings.DOCUMENT_OCR_HTTP_URL:
        return None

    clipped = contents[: max(0, int(settings.DOCUMENT_OCR_HTTP_MAX_BYTES))]
    encoded = base64.b64encode(clipped).decode("ascii")
    payload = {
        "file_name": file_name,
        "file_type": file_type,
        "content_type": content_type,
        "size_bytes": len(contents),
        "content_base64": encoded,
    }

    headers = {
        "Content-Type": "application/json",
        **_auth_headers(),
    }

    try:
        async with httpx.AsyncClient(timeout=settings.DOCUMENT_OCR_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(settings.DOCUMENT_OCR_HTTP_URL, json=payload, headers=headers)
    except httpx.HTTPError:
        return None

    if response.status_code >= 400:
        return None

    try:
        data = response.json()
    except ValueError:
        return None

    if not isinstance(data, dict):
        return None

    text_preview = data.get("text_preview")
    if not isinstance(text_preview, str) or not text_preview.strip():
        return None

    result: dict[str, Any] = {
        "provider": "http-ocr",
        "text_preview": text_preview.strip()[: int(settings.DOCUMENT_OCR_TEXT_PREVIEW_LIMIT)],
    }
    confidence = data.get("confidence")
    if isinstance(confidence, (int, float)):
        result["confidence"] = max(0.0, min(1.0, float(confidence)))
    model = data.get("model")
    if isinstance(model, str) and model.strip():
        result["model"] = model.strip()
    return result


async def extract_ocr_metadata(
    *,
    file_name: str,
    file_type: str,
    content_type: str | None,
    contents: bytes,
) -> dict[str, Any] | None:
    provider = settings.DOCUMENT_OCR_PROVIDER.lower().strip()
    if provider in {"", "auto"}:
        if settings.DOCUMENT_OCR_HTTP_URL:
            provider = "http"
        else:
            provider = "disabled"
    if provider in {"disabled", "none", "off"}:
        return None
    if provider in {"http", "trained", "model"}:
        return await _extract_with_http(
            file_name=file_name,
            file_type=file_type,
            content_type=content_type,
            contents=contents,
        )
    return None
