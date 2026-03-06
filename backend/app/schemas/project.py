from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Request Schemas ──

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    repository_url: Optional[str] = None
    default_branch: str = "main"
    language: str = "python"


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    repository_url: Optional[str] = None
    default_branch: Optional[str] = None


# ── Response Schemas ──

class ProjectOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    repository_url: Optional[str]
    default_branch: str
    language: str
    organization_id: UUID
    created_by: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListItem(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    language: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Architecture Version Schemas ──

class ArchVersionCreate(BaseModel):
    description: Optional[str] = None


class ArchVersionStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(draft|under_review|approved|active|deprecated)$")


class ArchVersionOut(BaseModel):
    id: UUID
    project_id: UUID
    version_number: int
    status: str
    description: Optional[str]
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    activated_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Architecture Rule Schemas ──

class RuleCreate(BaseModel):
    rule_text: str = Field(min_length=1)
    rule_type: str = Field(..., pattern="^(forbidden_dependency|required_dependency|layer_constraint|cycle_prohibition|naming_convention|custom)$")
    source_component: Optional[str] = None
    target_component: Optional[str] = None
    severity: str = Field("major", pattern="^(critical|major|minor)$")


class RuleBatchCreate(BaseModel):
    rules: list[RuleCreate] = Field(min_length=1)


class RuleUpdate(BaseModel):
    rule_text: Optional[str] = None
    severity: Optional[str] = Field(None, pattern="^(critical|major|minor)$")
    is_active: Optional[bool] = None


class RuleOut(BaseModel):
    id: UUID
    architecture_version_id: UUID
    rule_text: str
    rule_type: str
    source_component: Optional[str]
    target_component: Optional[str]
    severity: str
    is_ai_generated: bool
    confidence_score: Optional[float]
    is_active: bool
    created_by: Optional[UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Architecture Graph Schemas ──

class ComponentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    component_type: str = Field(..., pattern="^(service|layer|module|database|ui|api|gateway|external|queue)$")
    layer_level: Optional[int] = None
    description: Optional[str] = None


class ComponentBatchCreate(BaseModel):
    components: list[ComponentCreate] = Field(min_length=1)


class RelationshipCreate(BaseModel):
    source_uid: str
    target_uid: str
    type: str = Field(..., pattern="^(ALLOWED_DEPENDENCY|FORBIDDEN_DEPENDENCY|REQUIRES|LAYER_ABOVE)$")
    rule_id: Optional[str] = None


class RelationshipBatchCreate(BaseModel):
    relationships: list[RelationshipCreate] = Field(min_length=1)


class MappingCreate(BaseModel):
    intended_uid: str
    actual_uid: str
    mapping_type: str = Field("manual", pattern="^(manual|auto)$")


class MappingBatchCreate(BaseModel):
    mappings: list[MappingCreate] = Field(min_length=1)


class ComponentOut(BaseModel):
    uid: str
    name: str
    component_type: str
    layer_level: Optional[int] = None
    description: Optional[str] = None


class RelationshipOut(BaseModel):
    id: Optional[str] = None
    source_uid: str
    target_uid: str
    type: str
    properties: dict = {}


class GraphOut(BaseModel):
    components: list[ComponentOut]
    relationships: list[RelationshipOut]
    stats: dict
