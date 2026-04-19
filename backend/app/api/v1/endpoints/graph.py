"""Architecture graph endpoints — Neo4j operations."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from neo4j import AsyncSession as Neo4jSession

from app.core.deps import get_current_user, require_roles
from app.core.neo4j import Neo4jConnection
from app.core.responses import APIResponse, ResponseMeta
from app.models.user import User
from app.schemas.project import (
    ComponentBatchCreate,
    ComponentCreate,
    ComponentOut,
    GraphOut,
    MappingBatchCreate,
    RelationshipBatchCreate,
    RelationshipCreate,
)
from app.services import graph_service

router = APIRouter(tags=["Architecture Graph"])


def _meta() -> ResponseMeta:
    return ResponseMeta(request_id=str(uuid4()), timestamp=datetime.now(timezone.utc))


@router.post("/architecture/{version_id}/components", status_code=status.HTTP_201_CREATED)
async def create_component(
    version_id: UUID,
    body: ComponentCreate,
    user: User = Depends(require_roles("admin", "architect")),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    result = await graph_service.create_intended_component(
        neo4j_session,
        name=body.name,
        component_type=body.component_type,
        layer_level=body.layer_level,
        description=body.description,
        architecture_version_id=str(version_id),
        project_id=str(user.organization_id),  # or extract from version
    )
    return APIResponse(data=result, meta=_meta())


@router.post("/architecture/{version_id}/components/batch", status_code=status.HTTP_201_CREATED)
async def create_components_batch(
    version_id: UUID,
    body: ComponentBatchCreate,
    user: User = Depends(require_roles("admin", "architect")),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    results = await graph_service.create_intended_components_batch(
        neo4j_session,
        components=[c.model_dump() for c in body.components],
        architecture_version_id=str(version_id),
        project_id=str(user.organization_id),
    )
    return APIResponse(data={"created_count": len(results), "components": results}, meta=_meta())


@router.get("/architecture/{version_id}/graph")
async def get_graph(
    version_id: UUID,
    user: User = Depends(get_current_user),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    graph = await graph_service.get_intended_graph(
        neo4j_session,
        architecture_version_id=str(version_id),
    )
    return APIResponse(data=graph, meta=_meta())


@router.post("/architecture/{version_id}/relationships", status_code=status.HTTP_201_CREATED)
async def create_relationship(
    version_id: UUID,
    body: RelationshipCreate,
    user: User = Depends(require_roles("admin", "architect")),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    props = {}
    if body.rule_id:
        props["rule_id"] = body.rule_id
    result = await graph_service.create_relationship(
        neo4j_session,
        source_uid=body.source_uid,
        target_uid=body.target_uid,
        rel_type=body.type,
        architecture_version_id=str(version_id),
        properties=props,
    )
    return APIResponse(data=result, meta=_meta())


@router.delete("/architecture/{version_id}/relationships")
async def delete_relationship(
    version_id: UUID,
    source_uid: str,
    target_uid: str,
    type: str,
    user: User = Depends(require_roles("admin", "architect")),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    deleted = await graph_service.delete_relationship(
        neo4j_session,
        source_uid=source_uid,
        target_uid=target_uid,
        rel_type=type,
        architecture_version_id=str(version_id),
    )
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Relationship not found"})
    return APIResponse(data={"message": "Relationship deleted"}, meta=_meta())


@router.post("/architecture/{version_id}/relationships/batch", status_code=status.HTTP_201_CREATED)
async def create_relationships_batch(
    version_id: UUID,
    body: RelationshipBatchCreate,
    user: User = Depends(require_roles("admin", "architect")),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    results = []
    for rel in body.relationships:
        props = {}
        if rel.rule_id:
            props["rule_id"] = rel.rule_id
        r = await graph_service.create_relationship(
            neo4j_session,
            source_uid=rel.source_uid,
            target_uid=rel.target_uid,
            rel_type=rel.type,
            architecture_version_id=str(version_id),
            properties=props,
        )
        results.append(r)
    return APIResponse(data={"created_count": len(results), "relationships": results}, meta=_meta())


@router.delete("/architecture/{version_id}/components/{component_uid}")
async def delete_component(
    version_id: UUID,
    component_uid: str,
    user: User = Depends(require_roles("admin", "architect")),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    deleted = await graph_service.delete_intended_component(neo4j_session, component_uid=component_uid)
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Component not found"})
    return APIResponse(data={"message": "Component deleted"}, meta=_meta())


@router.post("/architecture/{version_id}/mappings", status_code=status.HTTP_201_CREATED)
async def create_mappings(
    version_id: UUID,
    body: MappingBatchCreate,
    user: User = Depends(require_roles("admin", "architect")),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    results = []
    for m in body.mappings:
        r = await graph_service.create_mapping(
            neo4j_session,
            intended_uid=m.intended_uid,
            actual_uid=m.actual_uid,
            mapping_type=m.mapping_type,
        )
        results.append(r)
    return APIResponse(data={"created_count": len(results), "mappings": results}, meta=_meta())
