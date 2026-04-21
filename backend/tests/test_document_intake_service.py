from __future__ import annotations

from app.services.document_intake import build_upload_intake


def test_build_upload_intake_extracts_text_preview_for_markdown():
    payload = build_upload_intake(
        file_name="architecture.md",
        file_type="markdown",
        content_type="text/markdown",
        contents=b"Service Layer must not call Database Layer directly.",
    )

    assert payload["source"] == "upload-intake-v1"
    assert payload["detected_format"] is None
    assert "text_preview" in payload
    assert "Service Layer" in payload["text_preview"]
    assert payload["word_count_estimate"] >= 5
    assert len(payload["sha256"]) == 64


def test_build_upload_intake_detects_png_signature():
    payload = build_upload_intake(
        file_name="diagram.png",
        file_type="diagram",
        content_type="image/png",
        contents=b"\x89PNG\r\n\x1a\n" + b"mock-image-bytes",
    )

    assert payload["detected_format"] == "png"
    assert "text_preview" not in payload


def test_build_upload_intake_extracts_pdf_preview_words():
    payload = build_upload_intake(
        file_name="design.pdf",
        file_type="pdf",
        content_type="application/pdf",
        contents=b"%PDF-1.7\nBT /F1 12 Tf (Payments Service depends on API Gateway) Tj ET\n",
    )

    assert payload["detected_format"] == "pdf"
    assert "text_preview" in payload
    assert "Payments" in payload["text_preview"]


def test_build_upload_intake_includes_ocr_metadata_when_available():
    payload = build_upload_intake(
        file_name="diagram.png",
        file_type="diagram",
        content_type="image/png",
        contents=b"\x89PNG\r\n\x1a\n" + b"mock-image-bytes",
        ocr_metadata={
            "provider": "http-ocr",
            "text_preview": "Billing Service talks to Gateway",
            "confidence": 0.88,
        },
    )

    assert payload["ocr_provider"] == "http-ocr"
    assert payload["ocr_text_preview"].startswith("Billing Service")
    assert payload["ocr_word_count_estimate"] >= 4
    assert payload["ocr_confidence"] == 0.88


def test_build_upload_intake_derives_diagram_hints_from_text_preview():
    payload = build_upload_intake(
        file_name="architecture.md",
        file_type="markdown",
        content_type="text/markdown",
        contents=b"Web App -> API Gateway. API Gateway calls Billing Service.",
    )

    assert "diagram_hints" in payload
    hints = payload["diagram_hints"]
    assert isinstance(hints["components"], list)
    assert isinstance(hints["relationships"], list)
    assert len(hints["relationships"]) >= 2


def test_build_upload_intake_derives_diagram_hints_from_ocr_preview():
    payload = build_upload_intake(
        file_name="diagram.png",
        file_type="diagram",
        content_type="image/png",
        contents=b"\x89PNG\r\n\x1a\n" + b"mock-image-bytes",
        ocr_metadata={
            "provider": "http-ocr",
            "text_preview": "Billing Service depends on Ledger Service",
            "confidence": 0.81,
        },
    )

    assert "diagram_hints" in payload
    hints = payload["diagram_hints"]
    assert any(rel["relation"] == "depends_on" for rel in hints["relationships"])
