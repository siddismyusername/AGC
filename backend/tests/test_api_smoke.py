from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_reports_service_status():
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ArchGuard"}


def test_openapi_exposes_versioned_api_routes():
    with TestClient(app) as client:
        response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    paths = schema.get("paths", {})
    assert "/api/v1/auth/register" in paths
    assert "/api/v1/projects" in paths
    assert "/api/v1/projects/{project_id}/compliance/check" in paths
    assert "/api/v1/architecture/{version_id}/relationships" in paths
    assert "/api/v1/projects/{project_id}/uploads/contracts" in paths
    assert "/api/v1/projects/{project_id}/documents/upload" in paths
    assert "/api/v1/projects/{project_id}/documents" in paths
    assert "/api/v1/projects/{project_id}/documents/dead-letter" in paths
    assert "/api/v1/projects/{project_id}/documents/{doc_id}/process" in paths
    assert "/api/v1/projects/{project_id}/documents/{doc_id}/job" in paths
    assert "/api/v1/projects/{project_id}/documents/{doc_id}/replay" in paths
    assert "/api/v1/ai/rules/extract" in paths
    assert "/api/v1/ai/ner/extract" in paths
    assert "/api/v1/ai/projects/{project_id}/documents/{doc_id}/rules/extract" in paths
    assert "/api/v1/ai/projects/{project_id}/documents/{doc_id}/ner/extract" in paths
    assert "/api/v1/ai/projects/{project_id}/documents/{doc_id}/diagram-hints/apply" in paths
    assert "/api/v1/ai/projects/{project_id}/documents/{doc_id}/candidates/review" in paths
    assert "/api/v1/organizations/me" in paths
    assert "/api/v1/organizations/me/members" in paths
    assert "/api/v1/analytics/summary" in paths
    assert "/api/v1/analytics/history" in paths
    assert "/api/v1/analytics/ai-candidate-reviews" in paths
    assert "/api/v1/analytics/worker-health" in paths
    assert "/api/v1/analytics/worker-ops" in paths
    assert "/api/v1/analytics/worker-actions/replay-retryable" in paths
    assert "/api/v1/analytics/documents/trends" in paths