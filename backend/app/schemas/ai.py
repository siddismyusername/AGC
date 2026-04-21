from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AITextExtractionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    architecture_version_id: UUID
    auto_create_rules: bool = False


class AIDocumentExtractionRequest(BaseModel):
    architecture_version_id: UUID
    auto_create_rules: bool = False
    persist_candidates: bool = True


class AIDocumentCandidateReviewRequest(BaseModel):
    architecture_version_id: UUID
    accepted_rule_indexes: list[int] = Field(default_factory=list)
    rejected_rule_indexes: list[int] = Field(default_factory=list)
    accepted_entity_indexes: list[int] = Field(default_factory=list)
    rejected_entity_indexes: list[int] = Field(default_factory=list)
    accepted_relationship_indexes: list[int] = Field(default_factory=list)
    rejected_relationship_indexes: list[int] = Field(default_factory=list)
    review_note: str | None = Field(default=None, max_length=1000)


class AIDocumentCandidateReviewOut(BaseModel):
    project_id: UUID
    document_id: UUID
    architecture_version_id: UUID
    reviewed_at: datetime
    reviewed_by: UUID
    accepted_rules_count: int
    rejected_rules_count: int
    accepted_entities_count: int
    rejected_entities_count: int
    accepted_relationships_count: int
    rejected_relationships_count: int
    review_history_count: int

    model_config = {"protected_namespaces": ()}


class AIDiagramHintRelationshipSelection(BaseModel):
    source: str
    target: str
    relation: str = "depends_on"


class AIDiagramHintsApplyRequest(BaseModel):
    architecture_version_id: UUID
    persist_applied_metadata: bool = True
    selected_components: list[str] | None = None
    selected_relationships: list[AIDiagramHintRelationshipSelection] | None = None
    review_note: str | None = Field(default=None, max_length=1000)


class AIDiagramHintsApplyOut(BaseModel):
    project_id: UUID
    document_id: UUID
    architecture_version_id: UUID
    created_components_count: int
    created_relationships_count: int
    skipped_relationships_count: int
    component_name_to_uid: dict[str, str]

    model_config = {"protected_namespaces": ()}


class AIEntityCandidateOut(BaseModel):
    text: str
    label: str
    start: int | None = None
    end: int | None = None
    confidence: float | None = None

    model_config = {"protected_namespaces": ()}


class AIRelationshipCandidateOut(BaseModel):
    source: str
    target: str
    relation: str
    confidence: float | None = None

    model_config = {"protected_namespaces": ()}


class AIRuleCandidateOut(BaseModel):
    rule_text: str
    rule_type: str
    source_component: str | None = None
    target_component: str | None = None
    severity: str
    confidence: float | None = None
    model_version: str | None = None

    model_config = {"protected_namespaces": ()}


class AIRuleExtractionOut(BaseModel):
    summary: str
    keywords: list[str]
    extracted_rules: list[AIRuleCandidateOut]
    entities: list[AIEntityCandidateOut]
    relationships: list[AIRelationshipCandidateOut]
    processing_time_ms: int
    model_info: dict[str, Any]
    created_rule_ids: list[UUID] = Field(default_factory=list)
    architecture_version_id: UUID

    model_config = {"protected_namespaces": ()}


class AINerExtractionOut(BaseModel):
    summary: str
    entities: list[AIEntityCandidateOut]
    relationships: list[AIRelationshipCandidateOut]
    processing_time_ms: int
    model_info: dict[str, Any]
    architecture_version_id: UUID

    model_config = {"protected_namespaces": ()}


class AIDocumentRuleExtractionOut(AIRuleExtractionOut):
    project_id: UUID
    document_id: UUID
    file_name: str
    file_type: str
    input_source_fields: list[str]

    model_config = {"protected_namespaces": ()}


class AIDocumentNerExtractionOut(AINerExtractionOut):
    project_id: UUID
    document_id: UUID
    file_name: str
    file_type: str
    input_source_fields: list[str]

    model_config = {"protected_namespaces": ()}
