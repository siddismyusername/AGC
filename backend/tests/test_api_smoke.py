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