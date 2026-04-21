from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any


_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_WHITESPACE_RE = re.compile(r"\s+")

_COMPONENT_KEYWORDS = (
    "service",
    "services",
    "gateway",
    "api",
    "database",
    "module",
    "layer",
    "component",
    "worker",
    "queue",
    "pipeline",
    "ui",
    "client",
    "controller",
    "adapter",
)

_RELATIONSHIP_MARKERS = {
    "depends on": "depends_on",
    "communicates with": "communicates_with",
    "calls": "calls",
    "uses": "uses",
    "accesses": "accesses",
    "reads from": "reads_from",
    "writes to": "writes_to",
    "routes through": "routes_through",
    "through": "routes_through",
    "via": "routes_through",
}

_FORBIDDEN_MARKERS = (
    "must not",
    "should not",
    "cannot",
    "can't",
    "may not",
    "never",
    "forbidden",
)

_REQUIRED_MARKERS = (
    "must",
    "should",
    "required",
    "requires",
    "depend on",
    "depends on",
    "communicate",
    "communicates",
    "call",
    "calls",
    "use",
    "uses",
    "access",
    "accesses",
    "through",
    "via",
)

_LAYER_MARKERS = (
    "layer",
    "above",
    "below",
    "higher than",
    "lower than",
    "inner",
    "outer",
)


@dataclass(frozen=True)
class _MatchSpan:
    text: str
    start: int
    end: int


def _normalize_text(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", text).strip()


def _split_sentences(text: str) -> list[str]:
    text = _normalize_text(text)
    if not text:
        return []
    return [part.strip() for part in _SENTENCE_SPLIT_RE.split(text) if part.strip()]


def _find_component_spans(text: str) -> list[_MatchSpan]:
    spans: list[_MatchSpan] = []
    seen: set[str] = set()

    patterns = [
        re.compile(r"\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)\s+(service|services|gateway|api|database|module|layer|component|worker|queue|pipeline|ui|client|controller|adapter)\b"),
        re.compile(r"\b(service|services|gateway|api|database|module|layer|component|worker|queue|pipeline|ui|client|controller|adapter)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)\b"),
        re.compile(r"\b[A-Z][a-z]+(?:[A-Z][a-z]+){1,}\b"),
    ]

    for pattern in patterns:
        for match in pattern.finditer(text):
            phrase = _normalize_text(match.group(0).strip(" ,.;:()[]{}"))
            phrase_key = phrase.lower()
            if not phrase or phrase_key in seen:
                continue
            seen.add(phrase_key)
            spans.append(_MatchSpan(text=phrase, start=match.start(), end=match.end()))

    # Common lower-case architectural nouns that may not be capitalized.
    for keyword in _COMPONENT_KEYWORDS:
        pattern = re.compile(rf"\b(?:the\s+)?([A-Za-z][A-Za-z0-9_-]*(?:\s+[A-Za-z][A-Za-z0-9_-]*){{0,3}}\s+{re.escape(keyword)})\b", re.IGNORECASE)
        for match in pattern.finditer(text):
            phrase = _normalize_text(match.group(1).strip(" ,.;:()[]{}"))
            phrase_key = phrase.lower()
            if not phrase or phrase_key in seen:
                continue
            seen.add(phrase_key)
            spans.append(_MatchSpan(text=phrase, start=match.start(1), end=match.end(1)))

    spans.sort(key=lambda item: item.start)
    return spans


def _extract_entities(text: str) -> list[dict[str, Any]]:
    entities: list[dict[str, Any]] = []
    for span in _find_component_spans(text):
        entities.append(
            {
                "text": span.text,
                "label": "COMPONENT",
                "start": span.start,
                "end": span.end,
                "confidence": 0.72,
            }
        )
    return entities


def _pick_components_for_sentence(sentence: str, global_spans: list[_MatchSpan]) -> list[_MatchSpan]:
    sentence_lower = sentence.lower()
    sentence_start = 0
    try:
        sentence_start = next(match.start() for match in re.finditer(re.escape(sentence), sentence))
    except StopIteration:
        sentence_start = 0

    local_spans = [span for span in global_spans if sentence_lower.find(span.text.lower()) != -1]
    if len(local_spans) >= 2:
        return local_spans

    sentence_spans = _find_component_spans(sentence)
    if sentence_spans:
        return sentence_spans

    # Fall back to generic noun phrases in the sentence, excluding leading articles.
    fallback_pattern = re.compile(r"\b(?:the|a|an)?\s*([A-Za-z][A-Za-z0-9_-]*(?:\s+[A-Za-z][A-Za-z0-9_-]*){0,2})\b")
    fallback_spans: list[_MatchSpan] = []
    for match in fallback_pattern.finditer(sentence):
        phrase = _normalize_text(match.group(1))
        if len(phrase.split()) < 1:
            continue
        fallback_spans.append(
            _MatchSpan(text=phrase, start=sentence_start + match.start(1), end=sentence_start + match.end(1))
        )
    return fallback_spans[:3]


def _rule_type_for_sentence(sentence_lower: str) -> tuple[str, str] | None:
    if any(marker in sentence_lower for marker in ("cycle", "circular dependency")):
        return "cycle_prohibition", "critical"
    if any(marker in sentence_lower for marker in _FORBIDDEN_MARKERS):
        return "forbidden_dependency", "critical"
    if any(marker in sentence_lower for marker in _LAYER_MARKERS):
        return "layer_constraint", "major"
    if any(marker in sentence_lower for marker in ("naming convention", "must be named", "should be named")):
        return "naming_convention", "minor"
    if any(marker in sentence_lower for marker in _REQUIRED_MARKERS):
        return "required_dependency", "major"
    return None


def _relationship_from_sentence(sentence_lower: str) -> str | None:
    for marker, relation in _RELATIONSHIP_MARKERS.items():
        if marker in sentence_lower:
            return relation
    return None


def analyze_text(text: str) -> dict[str, Any]:
    started_at = time.perf_counter()
    normalized_text = _normalize_text(text)
    sentences = _split_sentences(normalized_text)
    component_spans = _find_component_spans(normalized_text)
    entities = _extract_entities(normalized_text)

    rule_candidates: list[dict[str, Any]] = []
    relationship_candidates: list[dict[str, Any]] = []
    seen_rule_text: set[str] = set()
    seen_relationships: set[tuple[str, str, str]] = set()

    for sentence in sentences:
        sentence_lower = sentence.lower()
        matched_components = _pick_components_for_sentence(sentence, component_spans)
        if len(matched_components) >= 2:
            source_component = matched_components[0].text
            target_component = matched_components[-1].text
            rule_info = _rule_type_for_sentence(sentence_lower)
            if rule_info:
                rule_type, severity = rule_info
                if sentence not in seen_rule_text:
                    seen_rule_text.add(sentence)
                    rule_candidates.append(
                        {
                            "rule_text": sentence,
                            "rule_type": rule_type,
                            "source_component": source_component,
                            "target_component": target_component,
                            "severity": severity,
                            "confidence": 0.74 if rule_type != "naming_convention" else 0.66,
                            "model_version": "phase4-scaffold-v1",
                        }
                    )

            relation = _relationship_from_sentence(sentence_lower)
            if relation:
                key = (source_component.lower(), target_component.lower(), relation)
                if key not in seen_relationships:
                    seen_relationships.add(key)
                    relationship_candidates.append(
                        {
                            "source": source_component,
                            "target": target_component,
                            "relation": relation,
                            "confidence": 0.69,
                        }
                    )

    summary_bits = [f"Detected {len(rule_candidates)} rule candidate(s)", f"{len(entities)} entity candidate(s)"]
    if relationship_candidates:
        summary_bits.append(f"{len(relationship_candidates)} relationship candidate(s)")

    return {
        "summary": "; ".join(summary_bits) + ".",
        "keywords": sorted({token.lower().strip(".,;:") for token in re.findall(r"[A-Za-z][A-Za-z0-9_-]+", normalized_text) if len(token) > 3})[:18],
        "rule_candidates": rule_candidates,
        "entity_candidates": entities,
        "relationship_candidates": relationship_candidates,
        "processing_time_ms": max(1, int((time.perf_counter() - started_at) * 1000)),
        "model_info": {
            "name": "phase4-scaffold-text-analyzer",
            "version": "v1",
            "mode": "deterministic",
        },
    }
