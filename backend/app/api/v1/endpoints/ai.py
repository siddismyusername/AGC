from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from neo4j import AsyncSession as Neo4jSession

from app.api.v1.endpoints.projects import _meta
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.neo4j import Neo4jConnection
from app.core.responses import APIResponse
from app.models.document import UploadedDocument
from app.models.user import User
from app.schemas.ai import (
    AIDocumentCandidateReviewOut,
    AIDocumentCandidateReviewRequest,
    AIDiagramHintRelationshipSelection,
    AIDiagramHintsApplyOut,
    AIDiagramHintsApplyRequest,
    AIDocumentExtractionRequest,
    AIDocumentNerExtractionOut,
    AIDocumentRuleExtractionOut,
    AIEntityCandidateOut,
    AINerExtractionOut,
    AIRelationshipCandidateOut,
    AIRuleCandidateOut,
    AIRuleExtractionOut,
    AITextExtractionRequest,
)
from app.services import ai_extraction, graph_service, project_service


router = APIRouter(prefix="/ai", tags=["ai"])


def _validate_candidate_indexes(indexes: list[int], *, total: int, label: str) -> list[int]:
    normalized: list[int] = []
    seen: set[int] = set()
    for idx in indexes:
        if idx in seen:
            continue
        seen.add(idx)
        if idx < 0 or idx >= total:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "UNPROCESSABLE_ENTITY",
                    "message": f"{label} contains out-of-range index: {idx}",
                },
            )
        normalized.append(idx)
    return normalized


async def _resolve_owned_architecture_version(
    db: AsyncSession,
    *,
    version_id: UUID,
    user: User,
):
    version = await project_service.get_architecture_version(db, version_id=version_id)
    if not version:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Version not found"})

    project = await project_service.get_project(db, project_id=version.project_id)
    if not project or project.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Version not found"})
    return version


@router.post("/rules/extract")
async def extract_rules(
    body: AITextExtractionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    version = await _resolve_owned_architecture_version(db, version_id=body.architecture_version_id, user=user)
    analysis = ai_extraction.analyze_text(body.text)
    created_rule_ids: list[UUID] = []

    if body.auto_create_rules and user.role not in {"admin", "architect"}:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Only admin and architect roles can create rules"},
        )

    if body.auto_create_rules and analysis["rule_candidates"]:
        rules = await project_service.create_rules_batch(
            db,
            version_id=version.id,
            rules_data=[
                {
                    "rule_text": candidate["rule_text"],
                    "rule_type": candidate["rule_type"],
                    "source_component": candidate.get("source_component"),
                    "target_component": candidate.get("target_component"),
                    "severity": candidate.get("severity", "major"),
                    "is_ai_generated": True,
                    "confidence_score": candidate.get("confidence"),
                }
                for candidate in analysis["rule_candidates"]
            ],
            user_id=user.id,
        )
        created_rule_ids = [rule.id for rule in rules]

    payload = AIRuleExtractionOut(
        summary=analysis["summary"],
        keywords=analysis["keywords"],
        extracted_rules=[AIRuleCandidateOut.model_validate(candidate) for candidate in analysis["rule_candidates"]],
        entities=[AIEntityCandidateOut.model_validate(entity) for entity in analysis["entity_candidates"]],
        relationships=[AIRelationshipCandidateOut.model_validate(relationship) for relationship in analysis["relationship_candidates"]],
        processing_time_ms=analysis["processing_time_ms"],
        model_info=analysis["model_info"],
        created_rule_ids=created_rule_ids,
        architecture_version_id=version.id,
    )
    return APIResponse(data=payload.model_dump(), meta=_meta())


def _build_document_ai_input(document: UploadedDocument) -> tuple[str, list[str]]:
    extracted_data = document.extracted_data if isinstance(document.extracted_data, dict) else {}
    input_parts: list[str] = []
    input_source_fields: list[str] = []

    if document.file_name.strip():
        input_parts.append(f"Document name: {document.file_name.strip()}")
        input_source_fields.append("file_name")

    if (document.description or "").strip():
        input_parts.append(f"Document description: {document.description.strip()}")
        input_source_fields.append("description")

    summary = extracted_data.get("summary") if isinstance(extracted_data, dict) else None
    if isinstance(summary, str) and summary.strip():
        input_parts.append(f"Extraction summary: {summary.strip()}")
        input_source_fields.append("extracted_data.summary")

    keywords = extracted_data.get("keywords") if isinstance(extracted_data, dict) else None
    if isinstance(keywords, list):
        normalized_keywords = [str(keyword).strip() for keyword in keywords if str(keyword).strip()]
        if normalized_keywords:
            input_parts.append(f"Keywords: {', '.join(normalized_keywords)}")
            input_source_fields.append("extracted_data.keywords")

    error_meta = extracted_data.get("error") if isinstance(extracted_data, dict) else None
    if isinstance(error_meta, dict):
        error_code = error_meta.get("code")
        error_message = error_meta.get("message")
        if isinstance(error_code, str) and error_code.strip():
            input_parts.append(f"Last extraction error code: {error_code.strip()}")
            input_source_fields.append("extracted_data.error.code")
        if isinstance(error_message, str) and error_message.strip():
            input_parts.append(f"Last extraction error message: {error_message.strip()}")
            input_source_fields.append("extracted_data.error.message")

    upload_intake = extracted_data.get("upload_intake") if isinstance(extracted_data, dict) else None
    if isinstance(upload_intake, dict):
        detected_format = upload_intake.get("detected_format")
        if isinstance(detected_format, str) and detected_format.strip():
            input_parts.append(f"Detected binary format: {detected_format.strip()}")
            input_source_fields.append("extracted_data.upload_intake.detected_format")

        text_preview = upload_intake.get("text_preview")
        if isinstance(text_preview, str) and text_preview.strip():
            input_parts.append(f"Document content preview: {text_preview.strip()}")
            input_source_fields.append("extracted_data.upload_intake.text_preview")

        word_count_estimate = upload_intake.get("word_count_estimate")
        if isinstance(word_count_estimate, int):
            input_parts.append(f"Estimated preview word count: {word_count_estimate}")
            input_source_fields.append("extracted_data.upload_intake.word_count_estimate")

        ocr_text_preview = upload_intake.get("ocr_text_preview")
        if isinstance(ocr_text_preview, str) and ocr_text_preview.strip():
            input_parts.append(f"OCR content preview: {ocr_text_preview.strip()}")
            input_source_fields.append("extracted_data.upload_intake.ocr_text_preview")

        ocr_provider = upload_intake.get("ocr_provider")
        if isinstance(ocr_provider, str) and ocr_provider.strip():
            input_parts.append(f"OCR provider: {ocr_provider.strip()}")
            input_source_fields.append("extracted_data.upload_intake.ocr_provider")

        diagram_hints = upload_intake.get("diagram_hints")
        if isinstance(diagram_hints, dict):
            components = diagram_hints.get("components")
            relationships = diagram_hints.get("relationships")
            if isinstance(components, list) and components:
                normalized_components = [str(component).strip() for component in components if str(component).strip()]
                if normalized_components:
                    input_parts.append(f"Diagram components: {', '.join(normalized_components[:20])}")
                    input_source_fields.append("extracted_data.upload_intake.diagram_hints.components")
            if isinstance(relationships, list) and relationships:
                rel_lines: list[str] = []
                for relationship in relationships[:20]:
                    if not isinstance(relationship, dict):
                        continue
                    source = str(relationship.get("source") or "").strip()
                    target = str(relationship.get("target") or "").strip()
                    relation = str(relationship.get("relation") or "depends_on").strip() or "depends_on"
                    if source and target:
                        rel_lines.append(f"{source} {relation} {target}")
                if rel_lines:
                    input_parts.append("Diagram relationships: " + "; ".join(rel_lines))
                    input_source_fields.append("extracted_data.upload_intake.diagram_hints.relationships")

    return "\n".join(input_parts), input_source_fields


@router.post("/projects/{project_id}/documents/{doc_id}/rules/extract")
async def extract_rules_from_document(
    project_id: UUID,
    doc_id: UUID,
    body: AIDocumentExtractionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    version = await _resolve_owned_architecture_version(db, version_id=body.architecture_version_id, user=user)
    if version.project_id != project_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNPROCESSABLE_ENTITY", "message": "Architecture version does not belong to the project"},
        )

    document = (
        await db.execute(
            select(UploadedDocument).where(
                UploadedDocument.id == doc_id,
                UploadedDocument.project_id == project_id,
            )
        )
    ).scalar_one_or_none()
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Document not found"})

    document_input, input_source_fields = _build_document_ai_input(document)
    if not document_input.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNPROCESSABLE_ENTITY", "message": "Document does not have enough metadata for AI extraction"},
        )

    analysis = ai_extraction.analyze_text(document_input)
    created_rule_ids: list[UUID] = []

    if body.auto_create_rules and user.role not in {"admin", "architect"}:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Only admin and architect roles can create rules"},
        )

    if body.auto_create_rules and analysis["rule_candidates"]:
        rules = await project_service.create_rules_batch(
            db,
            version_id=version.id,
            rules_data=[
                {
                    "rule_text": candidate["rule_text"],
                    "rule_type": candidate["rule_type"],
                    "source_component": candidate.get("source_component"),
                    "target_component": candidate.get("target_component"),
                    "severity": candidate.get("severity", "major"),
                    "is_ai_generated": True,
                    "confidence_score": candidate.get("confidence"),
                }
                for candidate in analysis["rule_candidates"]
            ],
            user_id=user.id,
        )
        created_rule_ids = [rule.id for rule in rules]

    if body.persist_candidates:
        extracted_data = dict(document.extracted_data) if isinstance(document.extracted_data, dict) else {}
        extracted_data["ai_candidates"] = {
            "source": "phase4-document-ai-extractor",
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
            "architecture_version_id": str(version.id),
            "input_source_fields": input_source_fields,
            "summary": analysis["summary"],
            "keywords": analysis["keywords"],
            "rule_candidates": analysis["rule_candidates"],
            "entity_candidates": analysis["entity_candidates"],
            "relationship_candidates": analysis["relationship_candidates"],
            "processing_time_ms": analysis["processing_time_ms"],
            "model_info": analysis["model_info"],
            "created_rule_ids": [str(rule_id) for rule_id in created_rule_ids],
        }
        document.extracted_data = extracted_data
        document.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(document)

    payload = AIDocumentRuleExtractionOut(
        summary=analysis["summary"],
        keywords=analysis["keywords"],
        extracted_rules=[AIRuleCandidateOut.model_validate(candidate) for candidate in analysis["rule_candidates"]],
        entities=[AIEntityCandidateOut.model_validate(entity) for entity in analysis["entity_candidates"]],
        relationships=[AIRelationshipCandidateOut.model_validate(relationship) for relationship in analysis["relationship_candidates"]],
        processing_time_ms=analysis["processing_time_ms"],
        model_info=analysis["model_info"],
        created_rule_ids=created_rule_ids,
        architecture_version_id=version.id,
        project_id=project_id,
        document_id=document.id,
        file_name=document.file_name,
        file_type=document.file_type,
        input_source_fields=input_source_fields,
    )
    return APIResponse(data=payload.model_dump(), meta=_meta())


@router.post("/projects/{project_id}/documents/{doc_id}/ner/extract")
async def extract_entities_from_document(
    project_id: UUID,
    doc_id: UUID,
    body: AIDocumentExtractionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    version = await _resolve_owned_architecture_version(db, version_id=body.architecture_version_id, user=user)
    if version.project_id != project_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNPROCESSABLE_ENTITY", "message": "Architecture version does not belong to the project"},
        )

    document = (
        await db.execute(
            select(UploadedDocument).where(
                UploadedDocument.id == doc_id,
                UploadedDocument.project_id == project_id,
            )
        )
    ).scalar_one_or_none()
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Document not found"})

    document_input, input_source_fields = _build_document_ai_input(document)
    if not document_input.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNPROCESSABLE_ENTITY", "message": "Document does not have enough metadata for AI extraction"},
        )

    analysis = ai_extraction.analyze_text(document_input)
    payload = AIDocumentNerExtractionOut(
        summary=analysis["summary"],
        entities=[AIEntityCandidateOut.model_validate(entity) for entity in analysis["entity_candidates"]],
        relationships=[AIRelationshipCandidateOut.model_validate(relationship) for relationship in analysis["relationship_candidates"]],
        processing_time_ms=analysis["processing_time_ms"],
        model_info=analysis["model_info"],
        architecture_version_id=version.id,
        project_id=project_id,
        document_id=document.id,
        file_name=document.file_name,
        file_type=document.file_type,
        input_source_fields=input_source_fields,
    )
    return APIResponse(data=payload.model_dump(), meta=_meta())


@router.post("/projects/{project_id}/documents/{doc_id}/candidates/review")
async def review_document_ai_candidates(
    project_id: UUID,
    doc_id: UUID,
    body: AIDocumentCandidateReviewRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role not in {"admin", "architect", "developer", "devops"}:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Only privileged roles can review AI candidates"},
        )

    version = await _resolve_owned_architecture_version(db, version_id=body.architecture_version_id, user=user)
    if version.project_id != project_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNPROCESSABLE_ENTITY", "message": "Architecture version does not belong to the project"},
        )

    document = (
        await db.execute(
            select(UploadedDocument).where(
                UploadedDocument.id == doc_id,
                UploadedDocument.project_id == project_id,
            )
        )
    ).scalar_one_or_none()
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Document not found"})

    extracted_data = dict(document.extracted_data) if isinstance(document.extracted_data, dict) else {}
    ai_candidates = extracted_data.get("ai_candidates") if isinstance(extracted_data.get("ai_candidates"), dict) else None
    if not isinstance(ai_candidates, dict):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNPROCESSABLE_ENTITY", "message": "No persisted AI candidates available on this document"},
        )

    rule_candidates = ai_candidates.get("rule_candidates") if isinstance(ai_candidates.get("rule_candidates"), list) else []
    entity_candidates = ai_candidates.get("entity_candidates") if isinstance(ai_candidates.get("entity_candidates"), list) else []
    relationship_candidates = ai_candidates.get("relationship_candidates") if isinstance(ai_candidates.get("relationship_candidates"), list) else []

    accepted_rule_indexes = _validate_candidate_indexes(
        body.accepted_rule_indexes,
        total=len(rule_candidates),
        label="accepted_rule_indexes",
    )
    rejected_rule_indexes = _validate_candidate_indexes(
        body.rejected_rule_indexes,
        total=len(rule_candidates),
        label="rejected_rule_indexes",
    )
    accepted_entity_indexes = _validate_candidate_indexes(
        body.accepted_entity_indexes,
        total=len(entity_candidates),
        label="accepted_entity_indexes",
    )
    rejected_entity_indexes = _validate_candidate_indexes(
        body.rejected_entity_indexes,
        total=len(entity_candidates),
        label="rejected_entity_indexes",
    )
    accepted_relationship_indexes = _validate_candidate_indexes(
        body.accepted_relationship_indexes,
        total=len(relationship_candidates),
        label="accepted_relationship_indexes",
    )
    rejected_relationship_indexes = _validate_candidate_indexes(
        body.rejected_relationship_indexes,
        total=len(relationship_candidates),
        label="rejected_relationship_indexes",
    )

    reviewed_at = datetime.now(timezone.utc)
    review_history_raw = extracted_data.get("ai_candidates_reviews") if isinstance(extracted_data.get("ai_candidates_reviews"), list) else []
    review_history = [entry for entry in review_history_raw if isinstance(entry, dict)]
    note = (body.review_note or "").strip()
    review_history.append(
        {
            "reviewed_at": reviewed_at.isoformat(),
            "reviewed_by": str(user.id),
            "project_id": str(project_id),
            "document_id": str(document.id),
            "architecture_version_id": str(version.id),
            "accepted_rule_indexes": accepted_rule_indexes,
            "rejected_rule_indexes": rejected_rule_indexes,
            "accepted_entity_indexes": accepted_entity_indexes,
            "rejected_entity_indexes": rejected_entity_indexes,
            "accepted_relationship_indexes": accepted_relationship_indexes,
            "rejected_relationship_indexes": rejected_relationship_indexes,
            "accepted_rules": [rule_candidates[idx] for idx in accepted_rule_indexes],
            "rejected_rules": [rule_candidates[idx] for idx in rejected_rule_indexes],
            "accepted_entities": [entity_candidates[idx] for idx in accepted_entity_indexes],
            "rejected_entities": [entity_candidates[idx] for idx in rejected_entity_indexes],
            "accepted_relationships": [relationship_candidates[idx] for idx in accepted_relationship_indexes],
            "rejected_relationships": [relationship_candidates[idx] for idx in rejected_relationship_indexes],
            "note": note or None,
        }
    )

    ai_candidates["last_reviewed_at"] = reviewed_at.isoformat()
    ai_candidates["last_reviewed_by"] = str(user.id)
    extracted_data["ai_candidates"] = ai_candidates
    extracted_data["ai_candidates_reviews"] = review_history[-20:]
    document.extracted_data = extracted_data
    document.updated_at = reviewed_at
    await db.commit()
    await db.refresh(document)

    payload = AIDocumentCandidateReviewOut(
        project_id=project_id,
        document_id=document.id,
        architecture_version_id=version.id,
        reviewed_at=reviewed_at,
        reviewed_by=user.id,
        accepted_rules_count=len(accepted_rule_indexes),
        rejected_rules_count=len(rejected_rule_indexes),
        accepted_entities_count=len(accepted_entity_indexes),
        rejected_entities_count=len(rejected_entity_indexes),
        accepted_relationships_count=len(accepted_relationship_indexes),
        rejected_relationships_count=len(rejected_relationship_indexes),
        review_history_count=len(extracted_data["ai_candidates_reviews"]),
    )
    return APIResponse(data=payload.model_dump(), meta=_meta())


def _infer_component_type(name: str) -> str:
    lowered = name.lower()
    if "gateway" in lowered:
        return "gateway"
    if "api" in lowered:
        return "api"
    if "service" in lowered:
        return "service"
    if "database" in lowered or "db" in lowered or "store" in lowered:
        return "database"
    if "queue" in lowered or "topic" in lowered or "bus" in lowered:
        return "queue"
    if "ui" in lowered or "frontend" in lowered or "client" in lowered:
        return "ui"
    if "module" in lowered:
        return "module"
    return "service"


def _map_relation_to_graph_type(relation: str) -> str:
    normalized = relation.strip().lower()
    if normalized in {"depends_on", "calls", "uses", "communicates_with"}:
        return "ALLOWED_DEPENDENCY"
    return "REQUIRES"


def _normalize_diagram_relationship_payload(
    relationship: dict,
) -> AIDiagramHintRelationshipSelection | None:
    source_name = str(relationship.get("source") or "").strip()
    target_name = str(relationship.get("target") or "").strip()
    relation = str(relationship.get("relation") or "depends_on").strip() or "depends_on"
    if not source_name or not target_name:
        return None
    return AIDiagramHintRelationshipSelection(source=source_name, target=target_name, relation=relation)


@router.post("/projects/{project_id}/documents/{doc_id}/diagram-hints/apply")
async def apply_document_diagram_hints(
    project_id: UUID,
    doc_id: UUID,
    body: AIDiagramHintsApplyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    neo4j_session: Neo4jSession = Depends(Neo4jConnection.get_session),
):
    if user.role not in {"admin", "architect"}:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Only admin and architect roles can apply diagram hints"},
        )

    version = await _resolve_owned_architecture_version(db, version_id=body.architecture_version_id, user=user)
    if version.project_id != project_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNPROCESSABLE_ENTITY", "message": "Architecture version does not belong to the project"},
        )

    document = (
        await db.execute(
            select(UploadedDocument).where(
                UploadedDocument.id == doc_id,
                UploadedDocument.project_id == project_id,
            )
        )
    ).scalar_one_or_none()
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND", "message": "Document not found"})

    extracted_data = document.extracted_data if isinstance(document.extracted_data, dict) else {}
    upload_intake = extracted_data.get("upload_intake") if isinstance(extracted_data, dict) else None
    diagram_hints = upload_intake.get("diagram_hints") if isinstance(upload_intake, dict) else None
    if not isinstance(diagram_hints, dict):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNPROCESSABLE_ENTITY", "message": "No diagram hints available on this document"},
        )

    components = diagram_hints.get("components")
    relationships = diagram_hints.get("relationships")
    if not isinstance(components, list) or not components:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNPROCESSABLE_ENTITY", "message": "Diagram hints do not include components"},
        )

    selected_component_names: set[str] | None = None
    if body.selected_components is not None:
        selected_component_names = {
            str(component).strip()
            for component in body.selected_components
            if str(component).strip()
        }

    selected_relationship_keys: set[tuple[str, str, str]] | None = None
    if body.selected_relationships is not None:
        selected_relationship_keys = {
            (
                relationship.source.strip(),
                relationship.target.strip(),
                (relationship.relation or "depends_on").strip() or "depends_on",
            )
            for relationship in body.selected_relationships
            if relationship.source.strip() and relationship.target.strip()
        }

    selected_relationship_key_set = selected_relationship_keys or set()

    normalized_relationship_hints: list[AIDiagramHintRelationshipSelection] = []
    skipped_relationships_count = 0
    relationship_component_names: set[str] = set()
    all_normalized_relationship_hints: list[AIDiagramHintRelationshipSelection] = []
    if isinstance(relationships, list):
        for relationship in relationships:
            if not isinstance(relationship, dict):
                skipped_relationships_count += 1
                continue

            normalized = _normalize_diagram_relationship_payload(relationship)
            if not normalized:
                skipped_relationships_count += 1
                continue

            all_normalized_relationship_hints.append(normalized)

            key = (normalized.source, normalized.target, normalized.relation)
            if selected_relationship_keys is not None and key not in selected_relationship_keys:
                continue

            normalized_relationship_hints.append(normalized)
            relationship_component_names.add(normalized.source)
            relationship_component_names.add(normalized.target)

    selected_component_name_lookup = {name.lower() for name in selected_component_names} if selected_component_names is not None else None
    selected_component_set = selected_component_names or set()
    effective_component_names: list[str] = []
    seen_component_names: set[str] = set()
    for component_name_raw in components:
        component_name = str(component_name_raw).strip()
        if not component_name:
            continue
        if selected_component_name_lookup is not None and component_name.lower() not in selected_component_name_lookup:
            continue
        lowered = component_name.lower()
        if lowered in seen_component_names:
            continue
        effective_component_names.append(component_name)
        seen_component_names.add(lowered)

    for component_name in sorted(relationship_component_names):
        lowered = component_name.lower()
        if lowered in seen_component_names:
            continue
        effective_component_names.append(component_name)
        seen_component_names.add(lowered)

    if not effective_component_names:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNPROCESSABLE_ENTITY", "message": "No selected components or relationships to apply"},
        )

    existing_graph = await graph_service.get_intended_graph(
        neo4j_session,
        architecture_version_id=str(version.id),
    )
    existing_components = existing_graph.get("components") if isinstance(existing_graph, dict) else []
    existing_component_by_name: dict[str, str] = {}
    if isinstance(existing_components, list):
        for component in existing_components:
            if not isinstance(component, dict):
                continue
            name = str(component.get("name") or "").strip()
            uid = str(component.get("uid") or "").strip()
            if name and uid:
                existing_component_by_name[name.lower()] = uid

    component_name_to_uid: dict[str, str] = {}
    created_components_count = 0
    for component_name in effective_component_names:

        existing_uid = existing_component_by_name.get(component_name.lower())
        if existing_uid:
            component_name_to_uid[component_name] = existing_uid
            continue

        created_component = await graph_service.create_intended_component(
            neo4j_session,
            name=component_name,
            component_type=_infer_component_type(component_name),
            layer_level=None,
            description=f"Imported from document {document.file_name} diagram hints",
            architecture_version_id=str(version.id),
            project_id=str(project_id),
        )
        created_uid = str(created_component.get("uid") or "").strip()
        if created_uid:
            component_name_to_uid[component_name] = created_uid
            existing_component_by_name[component_name.lower()] = created_uid
            created_components_count += 1

    existing_graph_after_components = await graph_service.get_intended_graph(
        neo4j_session,
        architecture_version_id=str(version.id),
    )
    existing_relationships = existing_graph_after_components.get("relationships") if isinstance(existing_graph_after_components, dict) else []
    existing_relationship_keys: set[tuple[str, str, str]] = set()
    if isinstance(existing_relationships, list):
        for relationship in existing_relationships:
            if not isinstance(relationship, dict):
                continue
            source_uid = str(relationship.get("source_uid") or "").strip()
            target_uid = str(relationship.get("target_uid") or "").strip()
            rel_type = str(relationship.get("type") or "").strip()
            if source_uid and target_uid and rel_type:
                existing_relationship_keys.add((source_uid, target_uid, rel_type))

    created_relationships_count = 0
    for relationship in normalized_relationship_hints:
        source_name = relationship.source
        target_name = relationship.target
        relation = relationship.relation

        source_uid = component_name_to_uid.get(source_name)
        target_uid = component_name_to_uid.get(target_name)
        if not source_uid or not target_uid:
            skipped_relationships_count += 1
            continue

        graph_type = _map_relation_to_graph_type(relation)
        key = (source_uid, target_uid, graph_type)
        if key in existing_relationship_keys:
            skipped_relationships_count += 1
            continue

        await graph_service.create_relationship(
            neo4j_session,
            source_uid=source_uid,
            target_uid=target_uid,
            rel_type=graph_type,
            architecture_version_id=str(version.id),
            properties={
                "rule_id": f"diagram-hint:{document.id}",
                "severity": "minor",
            },
        )
        existing_relationship_keys.add(key)
        created_relationships_count += 1

    if body.persist_applied_metadata:
        next_extracted_data = dict(extracted_data)
        next_upload_intake = dict(upload_intake) if isinstance(upload_intake, dict) else {}
        review_history = next_upload_intake.get("diagram_hint_reviews")
        review_history_entries = list(review_history) if isinstance(review_history, list) else []

        accepted_components = effective_component_names
        all_component_names = [str(component).strip() for component in components if str(component).strip()]
        rejected_components = [
            component_name
            for component_name in all_component_names
            if component_name not in accepted_components
        ]

        accepted_relationships = [
            {
                "source": relationship.source,
                "target": relationship.target,
                "relation": relationship.relation,
            }
            for relationship in normalized_relationship_hints
        ]
        rejected_relationships = [
            {
                "source": relationship.source,
                "target": relationship.target,
                "relation": relationship.relation,
            }
            for relationship in all_normalized_relationship_hints
            if (relationship.source, relationship.target, relationship.relation) not in selected_relationship_key_set
        ] if body.selected_relationships is not None else []

        note = (body.review_note or "").strip()
        review_history_entries.append(
            {
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
                "reviewed_by": str(user.id),
                "architecture_version_id": str(version.id),
                "accepted_components": accepted_components,
                "accepted_relationships": accepted_relationships,
                "rejected_components": rejected_components,
                "rejected_relationships": rejected_relationships,
                "note": note or None,
            }
        )

        next_upload_intake["diagram_hints_applied"] = {
            "applied_at": datetime.now(timezone.utc).isoformat(),
            "applied_by": str(user.id),
            "architecture_version_id": str(version.id),
            "created_components_count": created_components_count,
            "created_relationships_count": created_relationships_count,
            "skipped_relationships_count": skipped_relationships_count,
        }
        next_upload_intake["diagram_hint_reviews"] = review_history_entries[-10:]
        next_extracted_data["upload_intake"] = next_upload_intake
        document.extracted_data = next_extracted_data
        document.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(document)

    payload = AIDiagramHintsApplyOut(
        project_id=project_id,
        document_id=document.id,
        architecture_version_id=version.id,
        created_components_count=created_components_count,
        created_relationships_count=created_relationships_count,
        skipped_relationships_count=skipped_relationships_count,
        component_name_to_uid=component_name_to_uid,
    )
    return APIResponse(data=payload.model_dump(), meta=_meta())


@router.post("/ner/extract")
async def extract_entities(
    body: AITextExtractionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    version = await _resolve_owned_architecture_version(db, version_id=body.architecture_version_id, user=user)
    analysis = ai_extraction.analyze_text(body.text)
    payload = AINerExtractionOut(
        summary=analysis["summary"],
        entities=[AIEntityCandidateOut.model_validate(entity) for entity in analysis["entity_candidates"]],
        relationships=[AIRelationshipCandidateOut.model_validate(relationship) for relationship in analysis["relationship_candidates"]],
        processing_time_ms=analysis["processing_time_ms"],
        model_info=analysis["model_info"],
        architecture_version_id=version.id,
    )
    return APIResponse(data=payload.model_dump(), meta=_meta())
