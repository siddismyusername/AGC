from __future__ import annotations

import json
import time
from typing import Any
from pydantic import BaseModel, Field

import ollama

from app.core.config import settings

# ── Pydantic Schemas for Structured Output ──

class ExtractedRuleCandidate(BaseModel):
    rule_text: str
    rule_type: str
    source_component: str | None = None
    target_component: str | None = None
    severity: str = "major"
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    model_version: str | None = None

class ExtractedEntityCandidate(BaseModel):
    text: str
    label: str
    start: int | None = None
    end: int | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

class ExtractedRelationshipCandidate(BaseModel):
    source: str
    target: str
    relation: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

class ArchitectureAnalysisResult(BaseModel):
    summary: str
    keywords: list[str]
    rule_candidates: list[ExtractedRuleCandidate]
    entity_candidates: list[ExtractedEntityCandidate]
    relationship_candidates: list[ExtractedRelationshipCandidate]

# ── Prompt for Qwen2.5 Coder ──

_SYSTEM_PROMPT = """You are an expert Software Architect AI. Your job is to extract structured architectural constraints, entities, and relationships from unstructured text.
Extract information into the exact JSON schema provided.
- rule_type should be one of: forbidden_dependency, required_dependency, layer_constraint, cycle_prohibition, naming_convention.
- severity should be one of: critical, major, minor.
- relationships should describe dependencies like: depends_on, communicates_with, reads_from, writes_to.
"""

async def analyze_text(text: str) -> dict[str, Any]:
    started_at = time.perf_counter()
    
    try:
        client = ollama.AsyncClient(host=settings.OLLAMA_HOST)
        response = await client.chat(
            model=settings.OLLAMA_TEXT_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": f"Analyze this architecture documentation:\n\n{text}"}
            ],
            format=ArchitectureAnalysisResult.model_json_schema()
        )
        
        # Parse the structured JSON output
        result_json = json.loads(response.message.content)
        parsed_result = ArchitectureAnalysisResult.model_validate(result_json)
        
        # Format the output matching the existing expected payload
        return {
            "summary": parsed_result.summary,
            "keywords": parsed_result.keywords,
            "rule_candidates": [r.model_dump() for r in parsed_result.rule_candidates],
            "entity_candidates": [e.model_dump() for e in parsed_result.entity_candidates],
            "relationship_candidates": [rel.model_dump() for rel in parsed_result.relationship_candidates],
            "processing_time_ms": max(1, int((time.perf_counter() - started_at) * 1000)),
            "model_info": {
                "name": settings.OLLAMA_TEXT_MODEL,
                "version": "latest",
                "mode": "ollama-inference",
            },
        }

    except Exception as e:
        # Fallback empty response gracefully in case of hallucination/ollama connection failure
        return {
            "summary": f"Failed to extract structured data: {str(e)}",
            "keywords": [],
            "rule_candidates": [],
            "entity_candidates": [],
            "relationship_candidates": [],
            "processing_time_ms": max(1, int((time.perf_counter() - started_at) * 1000)),
            "model_info": {
                "name": settings.OLLAMA_TEXT_MODEL,
                "version": "error",
                "mode": "failed",
            },
        }
