from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.services import document_ocr


def _register_and_login(client: TestClient) -> str:
    unique = uuid4().hex[:12]
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"ai-doc-{unique}@example.com",
            "password": "SecretPass123!",
            "full_name": "AI Doc Owner",
            "organization_name": f"AI Doc Org {unique}",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]["access_token"]


def test_document_ai_extraction_persists_candidates_and_can_create_rules():
    async def _fake_ocr_metadata(**kwargs):
        return {
            "provider": "test-ocr",
            "text_preview": "API Gateway calls Billing Service",
            "confidence": 0.93,
        }

    original_extract_ocr_metadata = document_ocr.extract_ocr_metadata
    document_ocr.extract_ocr_metadata = _fake_ocr_metadata
    try:
        with TestClient(app) as client:
            token = _register_and_login(client)
            headers = {"Authorization": f"Bearer {token}"}

            project_response = client.post(
                "/api/v1/projects",
                headers=headers,
                json={
                    "name": f"AI Doc Project {uuid4().hex[:8]}",
                    "description": "Project for document AI extraction tests",
                    "repository_url": "https://example.com/ai-doc.git",
                    "default_branch": "main",
                    "language": "python",
                },
            )
            assert project_response.status_code == 201
            project_id = project_response.json()["data"]["id"]

            version_response = client.post(
                f"/api/v1/projects/{project_id}/architecture",
                headers=headers,
                json={"description": "Architecture for document extraction"},
            )
            assert version_response.status_code == 201
            version_id = version_response.json()["data"]["id"]

            upload_response = client.post(
                f"/api/v1/projects/{project_id}/documents/upload",
                headers=headers,
                files={"file": ("system-design.md", b"api gateway and service dependencies", "text/markdown")},
                data={"file_type": "markdown", "description": "API Gateway should call Billing Service only."},
            )
            assert upload_response.status_code in {200, 201}
            document_id = upload_response.json()["data"]["id"]
            upload_extracted = upload_response.json()["data"].get("extracted_data") or {}
            assert "upload_intake" in upload_extracted
            assert upload_extracted["upload_intake"]["ocr_provider"] == "test-ocr"

            extraction_response = client.post(
                f"/api/v1/ai/projects/{project_id}/documents/{document_id}/rules/extract",
                headers=headers,
                json={
                    "architecture_version_id": version_id,
                    "auto_create_rules": True,
                    "persist_candidates": True,
                },
            )
            assert extraction_response.status_code == 200
            extraction_data = extraction_response.json()["data"]
            assert extraction_data["project_id"] == project_id
            assert extraction_data["document_id"] == document_id
            assert extraction_data["entities"]
            assert "file_name" in extraction_data
            assert extraction_data["input_source_fields"]
            assert "extracted_data.upload_intake.text_preview" in extraction_data["input_source_fields"]
            assert "extracted_data.upload_intake.ocr_text_preview" in extraction_data["input_source_fields"]

            document_response = client.get(
                f"/api/v1/projects/{project_id}/documents/{document_id}",
                headers=headers,
            )
            assert document_response.status_code == 200
            document_data = document_response.json()["data"]
            assert "ai_candidates" in (document_data["extracted_data"] or {})

            review_response = client.post(
                f"/api/v1/ai/projects/{project_id}/documents/{document_id}/candidates/review",
                headers=headers,
                json={
                    "architecture_version_id": version_id,
                    "accepted_rule_indexes": [0],
                    "rejected_rule_indexes": [],
                    "accepted_entity_indexes": [0],
                    "rejected_entity_indexes": [],
                    "accepted_relationship_indexes": [0],
                    "rejected_relationship_indexes": [],
                    "review_note": "Promote strongest candidates first.",
                },
            )
            assert review_response.status_code == 200
            review_data = review_response.json()["data"]
            assert review_data["project_id"] == project_id
            assert review_data["document_id"] == document_id
            assert review_data["accepted_rules_count"] == 1
            assert review_data["accepted_entities_count"] == 1
            assert review_data["accepted_relationships_count"] == 1

            reviewed_document_response = client.get(
                f"/api/v1/projects/{project_id}/documents/{document_id}",
                headers=headers,
            )
            assert reviewed_document_response.status_code == 200
            reviewed_extracted = reviewed_document_response.json()["data"].get("extracted_data") or {}
            ai_reviews = reviewed_extracted.get("ai_candidates_reviews") or []
            assert len(ai_reviews) >= 1
            latest_review = ai_reviews[-1]
            assert latest_review["accepted_rule_indexes"] == [0]
            assert latest_review["accepted_entity_indexes"] == [0]
            assert latest_review["accepted_relationship_indexes"] == [0]
            assert latest_review["note"] == "Promote strongest candidates first."

            review_trend_response = client.get(
                f"/api/v1/analytics/ai-candidate-reviews?days=14&project_id={project_id}",
                headers=headers,
            )
            assert review_trend_response.status_code == 200
            review_trend = review_trend_response.json()["data"]
            assert review_trend["project_id"] == project_id
            assert review_trend["total_reviews"] >= 1
            assert review_trend["reviewed_documents"] >= 1
            assert review_trend["accepted_candidates"] >= 3
            assert review_trend["rejected_candidates"] == 0
            assert isinstance(review_trend["points"], list)
            if review_trend["points"]:
                latest_point = review_trend["points"][-1]
                assert latest_point["review_count"] >= 1
                assert latest_point["accepted_candidates"] >= 3

            ner_response = client.post(
                f"/api/v1/ai/projects/{project_id}/documents/{document_id}/ner/extract",
                headers=headers,
                json={
                    "architecture_version_id": version_id,
                    "persist_candidates": False,
                },
            )
            assert ner_response.status_code == 200
            ner_data = ner_response.json()["data"]
            assert ner_data["entities"]

            rules_response = client.get(f"/api/v1/architecture/{version_id}/rules", headers=headers)
            assert rules_response.status_code == 200
            rules = rules_response.json()["data"]
            assert any(rule["is_ai_generated"] for rule in rules)
    finally:
        document_ocr.extract_ocr_metadata = original_extract_ocr_metadata


def test_apply_document_diagram_hints_creates_graph_components_and_relationships():
    async def _fake_ocr_metadata(**kwargs):
        return {
            "provider": "test-ocr",
            "text_preview": "Web App -> API Gateway. API Gateway calls Billing Service.",
            "confidence": 0.91,
        }

    original_extract_ocr_metadata = document_ocr.extract_ocr_metadata
    document_ocr.extract_ocr_metadata = _fake_ocr_metadata
    try:
        with TestClient(app) as client:
            token = _register_and_login(client)
            headers = {"Authorization": f"Bearer {token}"}

            project_response = client.post(
                "/api/v1/projects",
                headers=headers,
                json={
                    "name": f"AI Diagram Apply {uuid4().hex[:8]}",
                    "description": "Project for diagram hint apply",
                    "repository_url": "https://example.com/ai-diagram.git",
                    "default_branch": "main",
                    "language": "python",
                },
            )
            assert project_response.status_code == 201
            project_id = project_response.json()["data"]["id"]

            version_response = client.post(
                f"/api/v1/projects/{project_id}/architecture",
                headers=headers,
                json={"description": "Architecture for diagram hint apply"},
            )
            assert version_response.status_code == 201
            version_id = version_response.json()["data"]["id"]

            upload_response = client.post(
                f"/api/v1/projects/{project_id}/documents/upload",
                headers=headers,
                files={"file": ("diagram.png", b"\x89PNG\r\n\x1a\nmock", "image/png")},
                data={"file_type": "diagram", "description": "Gateway dependency diagram"},
            )
            assert upload_response.status_code in {200, 201}
            document_id = upload_response.json()["data"]["id"]

            apply_response = client.post(
                f"/api/v1/ai/projects/{project_id}/documents/{document_id}/diagram-hints/apply",
                headers=headers,
                json={
                    "architecture_version_id": version_id,
                    "persist_applied_metadata": True,
                },
            )
            assert apply_response.status_code == 200
            apply_data = apply_response.json()["data"]
            assert apply_data["created_components_count"] >= 2
            assert apply_data["created_relationships_count"] >= 1

            graph_response = client.get(f"/api/v1/architecture/{version_id}/graph", headers=headers)
            assert graph_response.status_code == 200
            graph_data = graph_response.json()["data"]
            assert graph_data["stats"]["total_components"] >= 2
            assert graph_data["stats"]["total_relationships"] >= 1

            document_response = client.get(
                f"/api/v1/projects/{project_id}/documents/{document_id}",
                headers=headers,
            )
            assert document_response.status_code == 200
            upload_intake = (document_response.json()["data"].get("extracted_data") or {}).get("upload_intake") or {}
            assert "diagram_hints_applied" in upload_intake
    finally:
        document_ocr.extract_ocr_metadata = original_extract_ocr_metadata


def test_apply_document_diagram_hints_respects_selected_items():
    async def _fake_ocr_metadata(**kwargs):
        return {
            "provider": "test-ocr",
            "text_preview": "Web App -> API Gateway. API Gateway calls Billing Service.",
            "confidence": 0.89,
        }

    original_extract_ocr_metadata = document_ocr.extract_ocr_metadata
    document_ocr.extract_ocr_metadata = _fake_ocr_metadata
    try:
        with TestClient(app) as client:
            token = _register_and_login(client)
            headers = {"Authorization": f"Bearer {token}"}

            project_response = client.post(
                "/api/v1/projects",
                headers=headers,
                json={
                    "name": f"AI Diagram Selective {uuid4().hex[:8]}",
                    "description": "Project for selective diagram hint apply",
                    "repository_url": "https://example.com/ai-diagram-selective.git",
                    "default_branch": "main",
                    "language": "python",
                },
            )
            assert project_response.status_code == 201
            project_id = project_response.json()["data"]["id"]

            version_response = client.post(
                f"/api/v1/projects/{project_id}/architecture",
                headers=headers,
                json={"description": "Architecture for selective diagram hint apply"},
            )
            assert version_response.status_code == 201
            version_id = version_response.json()["data"]["id"]

            upload_response = client.post(
                f"/api/v1/projects/{project_id}/documents/upload",
                headers=headers,
                files={"file": ("diagram.png", b"\x89PNG\r\n\x1a\nmock", "image/png")},
                data={"file_type": "diagram", "description": "Selective gateway dependency diagram"},
            )
            assert upload_response.status_code in {200, 201}
            document_id = upload_response.json()["data"]["id"]

            apply_response = client.post(
                f"/api/v1/ai/projects/{project_id}/documents/{document_id}/diagram-hints/apply",
                headers=headers,
                json={
                    "architecture_version_id": version_id,
                    "persist_applied_metadata": True,
                    "selected_components": ["Web App", "API"],
                    "selected_relationships": [
                        {
                            "source": "Web App",
                            "target": "API",
                            "relation": "depends_on",
                        }
                    ],
                },
            )
            assert apply_response.status_code == 200
            apply_data = apply_response.json()["data"]
            assert apply_data["created_components_count"] == 2
            assert apply_data["created_relationships_count"] == 1

            graph_response = client.get(f"/api/v1/architecture/{version_id}/graph", headers=headers)
            assert graph_response.status_code == 200
            graph_data = graph_response.json()["data"]
            assert graph_data["stats"]["total_components"] == 2
            assert graph_data["stats"]["total_relationships"] == 1

            document_response = client.get(
                f"/api/v1/projects/{project_id}/documents/{document_id}",
                headers=headers,
            )
            assert document_response.status_code == 200
            upload_intake = (document_response.json()["data"].get("extracted_data") or {}).get("upload_intake") or {}
            history = upload_intake.get("diagram_hint_reviews") or []
            assert len(history) >= 1
            latest = history[-1]
            assert "Web App" in (latest.get("accepted_components") or [])
            assert "Billing" in (latest.get("rejected_components") or [])
            assert (latest.get("accepted_relationships") or [])[0]["source"] == "Web App"
    finally:
        document_ocr.extract_ocr_metadata = original_extract_ocr_metadata


def test_diagram_hint_workflow_does_not_poison_a_followup_testclient_session():
    async def _fake_ocr_metadata(**kwargs):
        return {
            "provider": "test-ocr",
            "text_preview": "Web App -> API Gateway. API Gateway calls Billing Service.",
            "confidence": 0.87,
        }

    original_extract_ocr_metadata = document_ocr.extract_ocr_metadata
    document_ocr.extract_ocr_metadata = _fake_ocr_metadata
    try:
        with TestClient(app) as first_client:
            token = _register_and_login(first_client)
            headers = {"Authorization": f"Bearer {token}"}

            project_response = first_client.post(
                "/api/v1/projects",
                headers=headers,
                json={
                    "name": f"AI Diagram Regression {uuid4().hex[:8]}",
                    "description": "Project for diagram hint lifecycle regression",
                    "repository_url": "https://example.com/ai-diagram-regression.git",
                    "default_branch": "main",
                    "language": "python",
                },
            )
            assert project_response.status_code == 201
            project_id = project_response.json()["data"]["id"]

            version_response = first_client.post(
                f"/api/v1/projects/{project_id}/architecture",
                headers=headers,
                json={"description": "Architecture for diagram hint lifecycle regression"},
            )
            assert version_response.status_code == 201
            version_id = version_response.json()["data"]["id"]

            upload_response = first_client.post(
                f"/api/v1/projects/{project_id}/documents/upload",
                headers=headers,
                files={"file": ("diagram.png", b"\x89PNG\r\n\x1a\nmock", "image/png")},
                data={"file_type": "diagram", "description": "Lifecycle regression diagram"},
            )
            assert upload_response.status_code in {200, 201}
            document_id = upload_response.json()["data"]["id"]

            apply_response = first_client.post(
                f"/api/v1/ai/projects/{project_id}/documents/{document_id}/diagram-hints/apply",
                headers=headers,
                json={
                    "architecture_version_id": version_id,
                    "persist_applied_metadata": True,
                },
            )
            assert apply_response.status_code == 200

        with TestClient(app) as second_client:
            second_token = _register_and_login(second_client)
            second_headers = {"Authorization": f"Bearer {second_token}"}

            second_project_response = second_client.post(
                "/api/v1/projects",
                headers=second_headers,
                json={
                    "name": f"AI Diagram Regression Followup {uuid4().hex[:8]}",
                    "description": "Follow-up project after diagram hint lifecycle regression",
                    "repository_url": "https://example.com/ai-diagram-regression-followup.git",
                    "default_branch": "main",
                    "language": "python",
                },
            )
            assert second_project_response.status_code == 201
    finally:
        document_ocr.extract_ocr_metadata = original_extract_ocr_metadata
