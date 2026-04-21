from __future__ import annotations

import hashlib
import re
from typing import Any


_ASCII_PREVIEW_LIMIT = 1600
_TEXT_PREVIEW_LIMIT = 1000
_WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9_-]{1,}")
_ARROW_RELATION_RE = re.compile(r"\b([A-Za-z][A-Za-z0-9 _-]{1,40}?)\s*(?:->|→|=>)\s*([A-Za-z][A-Za-z0-9 _-]{1,40}?)\b")
_VERB_RELATIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b([A-Za-z][A-Za-z0-9 _-]{1,40}?)\s+depends\s+on\s+([A-Za-z][A-Za-z0-9 _-]{1,40}?)\b", re.IGNORECASE), "depends_on"),
    (re.compile(r"\b([A-Za-z][A-Za-z0-9 _-]{1,40}?)\s+calls\s+([A-Za-z][A-Za-z0-9 _-]{1,40}?)\b", re.IGNORECASE), "calls"),
    (re.compile(r"\b([A-Za-z][A-Za-z0-9 _-]{1,40}?)\s+uses\s+([A-Za-z][A-Za-z0-9 _-]{1,40}?)\b", re.IGNORECASE), "uses"),
    (re.compile(r"\b([A-Za-z][A-Za-z0-9 _-]{1,40}?)\s+communicates\s+with\s+([A-Za-z][A-Za-z0-9 _-]{1,40}?)\b", re.IGNORECASE), "communicates_with"),
    (re.compile(r"\b([A-Za-z][A-Za-z0-9 _-]{1,40}?)\s+talks\s+to\s+([A-Za-z][A-Za-z0-9 _-]{1,40}?)\b", re.IGNORECASE), "communicates_with"),
]


def _normalize_component_name(value: str) -> str:
    normalized = re.sub(r"\s+", " ", value).strip(" .,:;()[]{}")
    words = normalized.split()
    if len(words) == 0 or len(words) > 6:
        return ""
    return normalized


def _extract_diagram_hints(text_blobs: list[str]) -> dict[str, Any] | None:
    if not text_blobs:
        return None

    relationships: list[dict[str, str]] = []
    seen_relationships: set[tuple[str, str, str]] = set()
    components: set[str] = set()

    for blob in text_blobs:
        if not blob:
            continue

        for match in _ARROW_RELATION_RE.finditer(blob):
            source = _normalize_component_name(match.group(1))
            target = _normalize_component_name(match.group(2))
            if not source or not target or source.lower() == target.lower():
                continue
            key = (source.lower(), target.lower(), "depends_on")
            if key in seen_relationships:
                continue
            seen_relationships.add(key)
            components.add(source)
            components.add(target)
            relationships.append({"source": source, "target": target, "relation": "depends_on"})

        for regex, relation in _VERB_RELATIONS:
            for match in regex.finditer(blob):
                source = _normalize_component_name(match.group(1))
                target = _normalize_component_name(match.group(2))
                if not source or not target or source.lower() == target.lower():
                    continue
                key = (source.lower(), target.lower(), relation)
                if key in seen_relationships:
                    continue
                seen_relationships.add(key)
                components.add(source)
                components.add(target)
                relationships.append({"source": source, "target": target, "relation": relation})

    if not relationships:
        return None

    return {
        "components": sorted(components)[:40],
        "relationships": relationships[:80],
    }


def _detect_binary_format(contents: bytes, content_type: str | None = None) -> str | None:
    lowered_type = (content_type or "").lower()
    if contents.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if contents.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if contents[:6] in {b"GIF87a", b"GIF89a"}:
        return "gif"
    if contents.startswith(b"%PDF-"):
        return "pdf"
    if lowered_type in {"image/svg+xml", "text/svg+xml"}:
        return "svg"
    return None


def _ascii_preview(contents: bytes) -> str:
    return contents[:_ASCII_PREVIEW_LIMIT].decode("utf-8", errors="ignore").strip()


def _text_preview(contents: bytes) -> str:
    preview = _ascii_preview(contents)
    preview = re.sub(r"\s+", " ", preview).strip()
    return preview[:_TEXT_PREVIEW_LIMIT]


def _pdf_text_preview(contents: bytes) -> str:
    preview = _ascii_preview(contents)
    if not preview:
        return ""
    extracted_words = _WORD_RE.findall(preview)
    if not extracted_words:
        return ""
    normalized = " ".join(extracted_words)
    return normalized[:_TEXT_PREVIEW_LIMIT]


def build_upload_intake(
    *,
    file_name: str,
    file_type: str,
    content_type: str | None,
    contents: bytes,
    ocr_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    detected_format = _detect_binary_format(contents, content_type)
    sha256 = hashlib.sha256(contents).hexdigest()
    text_preview = ""

    lowered_name = file_name.lower()
    if file_type in {"text", "markdown"} or (content_type or "").startswith("text/"):
        text_preview = _text_preview(contents)
    elif file_type == "pdf" or detected_format == "pdf" or lowered_name.endswith(".pdf"):
        text_preview = _pdf_text_preview(contents)
    elif detected_format == "svg" or lowered_name.endswith(".svg"):
        text_preview = _text_preview(contents)

    intake: dict[str, Any] = {
        "source": "upload-intake-v1",
        "file_name": file_name,
        "file_type": file_type,
        "content_type": content_type,
        "size_bytes": len(contents),
        "sha256": sha256,
        "binary_signature_hex": contents[:16].hex(),
        "detected_format": detected_format,
    }
    if text_preview:
        intake["text_preview"] = text_preview
        intake["word_count_estimate"] = len(_WORD_RE.findall(text_preview))

    ocr_preview_for_hints = ""
    if isinstance(ocr_metadata, dict):
        ocr_preview = ocr_metadata.get("text_preview")
        if isinstance(ocr_preview, str) and ocr_preview.strip():
            ocr_preview_for_hints = ocr_preview.strip()
            intake["ocr_text_preview"] = ocr_preview_for_hints
            intake["ocr_word_count_estimate"] = len(_WORD_RE.findall(ocr_preview))
        ocr_provider = ocr_metadata.get("provider")
        if isinstance(ocr_provider, str) and ocr_provider.strip():
            intake["ocr_provider"] = ocr_provider.strip()
        ocr_confidence = ocr_metadata.get("confidence")
        if isinstance(ocr_confidence, (int, float)):
            intake["ocr_confidence"] = max(0.0, min(1.0, float(ocr_confidence)))

    diagram_hints = _extract_diagram_hints([text_preview, ocr_preview_for_hints])
    if diagram_hints:
        intake["diagram_hints"] = diagram_hints
    return intake
