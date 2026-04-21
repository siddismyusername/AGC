from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _register_and_login(client: TestClient) -> str:
    unique = uuid4().hex[:12]
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"ai-{unique}@example.com",
            "password": "SecretPass123!",
            "full_name": "AI Owner",
            "organization_name": f"AI Org {unique}",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]["access_token"]


def test_ai_text_extraction_can_create_rules_from_an_architecture_version():
    with TestClient(app) as client:
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        project_response = client.post(
            "/api/v1/projects",
            headers=headers,
            json={
                "name": f"AI Project {uuid4().hex[:8]}",
                "description": "Project for AI extraction tests",
                "repository_url": "https://example.com/ai.git",
                "default_branch": "main",
                "language": "python",
            },
        )
        assert project_response.status_code == 201
        project_id = project_response.json()["data"]["id"]

        version_response = client.post(
            f"/api/v1/projects/{project_id}/architecture",
            headers=headers,
            json={"description": "Baseline architecture version"},
        )
        assert version_response.status_code == 201
        version_id = version_response.json()["data"]["id"]

        text = (
            "The web client must not call the database directly. "
            "Payment Service uses the API Gateway. "
            "The reporting module depends on the analytics service."
        )

        extraction_response = client.post(
            "/api/v1/ai/rules/extract",
            headers=headers,
            json={
                "text": text,
                "architecture_version_id": version_id,
                "auto_create_rules": True,
            },
        )
        assert extraction_response.status_code == 200
        extraction = extraction_response.json()["data"]
        assert extraction["extracted_rules"]
        assert extraction["entities"]
        assert extraction["created_rule_ids"]

        ner_response = client.post(
            "/api/v1/ai/ner/extract",
            headers=headers,
            json={
                "text": text,
                "architecture_version_id": version_id,
            },
        )
        assert ner_response.status_code == 200
        ner_payload = ner_response.json()["data"]
        assert ner_payload["entities"]

        rules_response = client.get(f"/api/v1/architecture/{version_id}/rules", headers=headers)
        assert rules_response.status_code == 200
        rules = rules_response.json()["data"]
        assert any(rule["is_ai_generated"] for rule in rules)
