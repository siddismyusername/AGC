from __future__ import annotations

import hashlib
import hmac
import json
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _register_and_login(client: TestClient) -> str:
    unique = uuid4().hex[:12]
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"webhook-{unique}@example.com",
            "password": "SecretPass123!",
            "full_name": "Webhook Owner",
            "organization_name": f"Webhook Org {unique}",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]["access_token"]


def _create_active_version(client: TestClient, headers: dict[str, str], project_id: str) -> str:
    version_response = client.post(
        f"/api/v1/projects/{project_id}/architecture",
        headers=headers,
        json={"description": "Active version for webhook tests"},
    )
    assert version_response.status_code == 201
    version_id = version_response.json()["data"]["id"]

    review_response = client.patch(
        f"/api/v1/projects/{project_id}/architecture/{version_id}/status",
        headers=headers,
        json={"status": "under_review"},
    )
    assert review_response.status_code == 200
    assert review_response.json()["data"]["status"] == "under_review"

    approve_response = client.patch(
        f"/api/v1/projects/{project_id}/architecture/{version_id}/status",
        headers=headers,
        json={"status": "approved"},
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["data"]["status"] == "approved"

    activate_response = client.patch(
        f"/api/v1/projects/{project_id}/architecture/{version_id}/status",
        headers=headers,
        json={"status": "active"},
    )
    assert activate_response.status_code == 200
    assert activate_response.json()["data"]["status"] == "active"
    return version_id


def _create_project(client: TestClient, headers: dict[str, str], name_prefix: str = "Webhook Project") -> str:
    project_response = client.post(
        "/api/v1/projects",
        headers=headers,
        json={
            "name": f"{name_prefix} {uuid4().hex[:8]}",
            "description": "Project for webhook tests",
            "repository_url": "https://example.com/webhook.git",
            "default_branch": "main",
            "language": "python",
        },
    )
    assert project_response.status_code == 201
    return project_response.json()["data"]["id"]


def test_github_webhook_requires_signature_and_returns_compliance_result():
    with TestClient(app) as client:
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        project_id = _create_project(client, headers, "GitHub Webhook")
        _create_active_version(client, headers, project_id)

        pipeline_response = client.post(
            f"/api/v1/projects/{project_id}/pipelines",
            headers=headers,
            json={
                "name": "GitHub Actions",
                "provider": "github_actions",
                "config": {},
            },
        )
        assert pipeline_response.status_code == 201
        pipeline_id = pipeline_response.json()["data"]["id"]
        webhook_secret = pipeline_response.json()["data"]["webhook_secret"]

        missing_signature_response = client.post(
            f"/api/v1/webhooks/{pipeline_id}/github",
            headers={"X-GitHub-Event": "push"},
            json={"after": "1234567890abcdef", "ref": "refs/heads/main"},
        )
        assert missing_signature_response.status_code == 401
        assert missing_signature_response.json()["detail"]["code"] == "MISSING_SIGNATURE"

        payload = {"after": "1234567890abcdef", "ref": "refs/heads/main"}
        body = json.dumps(payload).encode("utf-8")
        signature = "sha256=" + hmac.new(webhook_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

        webhook_response = client.post(
            f"/api/v1/webhooks/{pipeline_id}/github",
            headers={
                "X-GitHub-Event": "push",
                "X-Hub-Signature-256": signature,
            },
            content=body,
        )
        assert webhook_response.status_code == 200
        payload = webhook_response.json()["data"]
        assert payload["action"] == "compliance_check_completed"
        assert payload["should_block_pipeline"] in {True, False}
        assert payload["compliance_status"] in {"passed", "failed", "error"}
        assert payload["commit"] == "1234567890abcdef"
        assert payload["branch"] == "main"


def test_gitlab_webhook_requires_token_and_rejects_provider_mismatch():
    with TestClient(app) as client:
        token = _register_and_login(client)
        headers = {"Authorization": f"Bearer {token}"}

        project_id = _create_project(client, headers, "GitLab Webhook")
        _create_active_version(client, headers, project_id)

        pipeline_response = client.post(
            f"/api/v1/projects/{project_id}/pipelines",
            headers=headers,
            json={
                "name": "GitLab CI",
                "provider": "gitlab_ci",
                "config": {},
            },
        )
        assert pipeline_response.status_code == 201
        pipeline_id = pipeline_response.json()["data"]["id"]
        webhook_secret = pipeline_response.json()["data"]["webhook_secret"]

        missing_token_response = client.post(
            f"/api/v1/webhooks/{pipeline_id}/gitlab",
            headers={"X-Gitlab-Event": "Push Hook"},
            json={"after": "1234567890abcdef", "ref": "refs/heads/main"},
        )
        assert missing_token_response.status_code == 401
        assert missing_token_response.json()["detail"]["code"] == "MISSING_TOKEN"

        wrong_provider_response = client.post(
            f"/api/v1/webhooks/{pipeline_id}/github",
            headers={"X-GitHub-Event": "push", "X-Hub-Signature-256": "sha256=deadbeef"},
            json={"after": "1234567890abcdef", "ref": "refs/heads/main"},
        )
        assert wrong_provider_response.status_code == 422
        assert wrong_provider_response.json()["detail"]["code"] == "INVALID_PIPELINE_PROVIDER"
