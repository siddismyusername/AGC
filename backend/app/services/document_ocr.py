from __future__ import annotations

import base64
import json
from typing import Any
from pydantic import BaseModel, Field

import ollama
from google import genai
from google.genai import types

from app.core.config import settings

# ── Pydantic Schemas for Structured Output ──

class DiagramComponentCandidate(BaseModel):
    label: str
    component_type: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

class DiagramRelationshipCandidate(BaseModel):
    source: str
    target: str
    relation_type: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

class DiagramExtractionResult(BaseModel):
    text_preview: str = Field(description="A brief description of what the diagram contains.")
    detected_components: list[DiagramComponentCandidate]
    detected_relationships: list[DiagramRelationshipCandidate]
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


_VISION_PROMPT = """You are an expert architecture diagram analyzer. 
Analyze this system architecture diagram and extract:
1. A brief text_preview describing the architecture pattern.
2. The architectural components (detected_components) with their labels and types (e.g. Database, API, Service).
3. The relationships/connections between them (detected_relationships) and the relation_type (e.g. reads_from, writes_to, calls).
Return strictly matching the requested JSON schema.
"""

async def _extract_with_ollama(contents: bytes) -> dict[str, Any] | None:
    try:
        client = ollama.AsyncClient(host=settings.OLLAMA_HOST)
        encoded_image = base64.b64encode(contents).decode("ascii")
        
        response = await client.chat(
            model=settings.OLLAMA_VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": _VISION_PROMPT,
                    "images": [encoded_image]
                }
            ],
            format=DiagramExtractionResult.model_json_schema()
        )
        
        result_json = json.loads(response.message.content)
        parsed_result = DiagramExtractionResult.model_validate(result_json)
        
        return {
            "provider": "ollama-qwen-vl",
            "model": settings.OLLAMA_VISION_MODEL,
            "text_preview": parsed_result.text_preview[: int(settings.DOCUMENT_OCR_TEXT_PREVIEW_LIMIT)],
            "detected_components": [c.model_dump() for c in parsed_result.detected_components],
            "detected_relationships": [r.model_dump() for r in parsed_result.detected_relationships],
            "confidence": parsed_result.confidence or 0.8,
        }
    except Exception as e:
        # Fallthrough to None so Gemini can try
        import logging
        logging.getLogger("archguard").warning(f"Ollama Vision failed: {str(e)}")
        return None

async def _extract_with_gemini(contents: bytes, mime_type: str) -> dict[str, Any] | None:
    if not settings.GEMINI_API_KEY:
        return None
        
    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        
        response = await client.aio.models.generate_content(
            model='gemini-1.5-flash',
            contents=[
                types.Part.from_bytes(data=contents, mime_type=mime_type),
                _VISION_PROMPT,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=DiagramExtractionResult,
            ),
        )
        
        result_json = json.loads(response.text)
        parsed_result = DiagramExtractionResult.model_validate(result_json)
        
        return {
            "provider": "gemini-flash-fallback",
            "model": "gemini-1.5-flash",
            "text_preview": parsed_result.text_preview[: int(settings.DOCUMENT_OCR_TEXT_PREVIEW_LIMIT)],
            "detected_components": [c.model_dump() for c in parsed_result.detected_components],
            "detected_relationships": [r.model_dump() for r in parsed_result.detected_relationships],
            "confidence": parsed_result.confidence or 0.9,
        }
    except Exception as e:
        import logging
        logging.getLogger("archguard").error(f"Gemini Fallback Vision failed: {str(e)}")
        return None


async def extract_ocr_metadata(
    *,
    file_name: str,
    file_type: str,
    content_type: str | None,
    contents: bytes,
) -> dict[str, Any] | None:
    
    provider = settings.DOCUMENT_OCR_PROVIDER.lower().strip()
    if provider in {"disabled", "none", "off"}:
        return None
        
    mime_type = content_type or "image/png"
    
    # 1. Try Local Ollama First
    result = await _extract_with_ollama(contents)
    if result:
        return result
        
    # 2. Try Gemini Fallback
    result = await _extract_with_gemini(contents, mime_type)
    if result:
        return result
        
    return None
