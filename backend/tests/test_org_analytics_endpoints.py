from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _register_and_login(client: TestClient) -> str:
  unique = uuid4().hex[:12]
  response = client.post(
    "/api/v1/auth/register",
    json={
      "email": f"owner-{unique}@example.com",
      "password": "SecretPass123!",
      "full_name": "Org Owner",
      "organization_name": f"Org {unique}",
    },
  )
  assert response.status_code == 201
  payload = response.json()["data"]
  return payload["access_token"]


def test_organization_me_endpoints_require_and_return_auth_context():
  with TestClient(app) as client:
    unauth_org_patch = client.patch("/api/v1/organizations/me", json={"description": "No token"})
    assert unauth_org_patch.status_code == 403

    unauth_project_create = client.post(
      "/api/v1/projects",
      json={
        "name": "NoAuth Project",
        "description": "Should be blocked",
        "repository_url": "https://example.com/noauth.git",
        "default_branch": "main",
        "language": "python",
      },
    )
    assert unauth_project_create.status_code == 403

    unauth_analytics = client.get("/api/v1/analytics/summary")
    assert unauth_analytics.status_code == 403

    invalid_token_analytics = client.get(
      "/api/v1/analytics/history",
      headers={"Authorization": "Bearer invalid.token.value"},
    )
    assert invalid_token_analytics.status_code == 401

    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    get_response = client.get("/api/v1/organizations/me", headers=headers)
    assert get_response.status_code == 200
    org_data = get_response.json()["data"]
    assert org_data["name"].startswith("Org ")
    assert org_data["members_count"] == 1

    members_response = client.get("/api/v1/organizations/me/members", headers=headers)
    assert members_response.status_code == 200
    members = members_response.json()["data"]
    assert len(members) == 1
    assert members[0]["email"].startswith("owner-")
    assert members[0]["full_name"] == "Org Owner"

    patch_response = client.patch(
      "/api/v1/organizations/me",
      headers=headers,
      json={
        "name": f"Renamed Org {uuid4().hex[:8]}",
        "description": "Updated from integration test",
      },
    )
    assert patch_response.status_code == 200
    updated = patch_response.json()["data"]
    assert updated["description"] == "Updated from integration test"

    conflict_org_name = f"Conflict Org {uuid4().hex[:8]}"
    conflict_register = client.post(
      "/api/v1/auth/register",
      json={
        "email": f"conflict-{uuid4().hex[:10]}@example.com",
        "password": "SecretPass123!",
        "full_name": "Conflict Owner",
        "organization_name": conflict_org_name,
      },
    )
    assert conflict_register.status_code == 201

    conflict_update = client.patch(
      "/api/v1/organizations/me",
      headers=headers,
      json={"name": conflict_org_name},
    )
    assert conflict_update.status_code == 409

    create_project_response = client.post(
      "/api/v1/projects",
      headers=headers,
      json={
        "name": f"Compliance Core {uuid4().hex[:6]}",
        "description": "Initial project description",
        "repository_url": "https://example.com/repo.git",
        "default_branch": "main",
        "language": "python",
      },
    )
    assert create_project_response.status_code == 201
    project_id = create_project_response.json()["data"]["id"]

    update_project_response = client.put(
      f"/api/v1/projects/{project_id}",
      headers=headers,
      json={"name": "Compliance Core Renamed"},
    )
    assert update_project_response.status_code == 200

    invalid_token_project_create = client.post(
      "/api/v1/projects",
      headers={"Authorization": "Bearer invalid.token.value"},
      json={
        "name": "InvalidToken Project",
        "description": "Should fail",
        "repository_url": "https://example.com/invalid.git",
        "default_branch": "main",
        "language": "python",
      },
    )
    assert invalid_token_project_create.status_code == 401

    audit_response = client.get("/api/v1/audit/events?page=1&per_page=20", headers=headers)
    assert audit_response.status_code == 200
    audit_events = audit_response.json()["data"]
    project_update_event = next(event for event in audit_events if event["action"] == "project.update")
    assert project_update_event["old_value"]["name"].startswith("Compliance Core")
    assert project_update_event["new_value"]["name"] == "Compliance Core Renamed"

    response = client.get("/api/v1/analytics/summary", headers=headers)
    assert response.status_code == 200

    data = response.json()["data"]
    assert data["active_projects"] == 1
    assert data["total_reports"] == 0
    assert data["critical_violations"] == 0
    assert data["recent_audit_events"] >= 1
    assert data["average_health_score"] == 0.0
    assert data["total_documents"] == 0
    assert data["pending_documents"] == 0
    assert data["processing_documents"] == 0
    assert data["completed_documents"] == 0
    assert data["failed_documents"] == 0

    history_response = client.get("/api/v1/analytics/history?days=14", headers=headers)
    assert history_response.status_code == 200
    history_data = history_response.json()["data"]
    assert history_data["days"] == 14
    assert isinstance(history_data["points"], list)

    worker_health = client.get("/api/v1/analytics/worker-health", headers=headers)
    assert worker_health.status_code == 200
    worker_health_data = worker_health.json()["data"]
    assert worker_health_data["queue_backend"] == "celery"
    assert worker_health_data["redis_status"] in {"healthy", "unreachable"}
    assert worker_health_data["worker_status"] in {"healthy", "degraded", "down"}

    worker_ops = client.get("/api/v1/analytics/worker-ops", headers=headers)
    assert worker_ops.status_code == 200
    worker_ops_data = worker_ops.json()["data"]
    assert worker_ops_data["queue_backend"] == "celery"
    assert worker_ops_data["worker_status"] in {"healthy", "degraded", "down"}
    assert len(worker_ops_data["recommended_actions"]) >= 2
    assert len(worker_ops_data["runbook_commands"]) >= 2
    assert "command" in worker_ops_data["runbook_commands"][0]

    document_trends = client.get("/api/v1/analytics/documents/trends?days=14", headers=headers)
    assert document_trends.status_code == 200
    trend_data = document_trends.json()["data"]
    assert trend_data["days"] == 14
    assert isinstance(trend_data["points"], list)
    if trend_data["points"]:
      sample = trend_data["points"][-1]
      assert "uploaded_delta_day_over_day" in sample
      assert "completed_delta_day_over_day" in sample
      assert "failed_delta_day_over_day" in sample
      assert "processing_delta_day_over_day" in sample
      assert "success_rate_percent" in sample
      assert "failure_rate_percent" in sample

    invalid_history_days = client.get("/api/v1/analytics/history?days=999", headers=headers)
    assert invalid_history_days.status_code == 422

    invalid_trend_days = client.get("/api/v1/analytics/documents/trends?days=999", headers=headers)
    assert invalid_trend_days.status_code == 422

    graph_project_response = client.post(
      "/api/v1/projects",
      headers=headers,
      json={
        "name": f"Graph Project {uuid4().hex[:6]}",
        "description": "Graph regression project",
        "repository_url": "https://example.com/graph.git",
        "default_branch": "main",
        "language": "python",
      },
    )
    assert graph_project_response.status_code == 201
    graph_project_id = graph_project_response.json()["data"]["id"]

    graph_version_response = client.post(
      f"/api/v1/projects/{graph_project_id}/architecture",
      headers=headers,
      json={"description": "Initial architecture version"},
    )
    assert graph_version_response.status_code == 201
    graph_version_id = graph_version_response.json()["data"]["id"]

    source_component = client.post(
      f"/api/v1/architecture/{graph_version_id}/components",
      headers=headers,
      json={
        "name": "ServiceLayer",
        "component_type": "service",
        "layer_level": 1,
        "description": "Service layer",
      },
    )
    assert source_component.status_code == 201
    source_uid = source_component.json()["data"]["uid"]

    target_component = client.post(
      f"/api/v1/architecture/{graph_version_id}/components",
      headers=headers,
      json={
        "name": "DatabaseLayer",
        "component_type": "database",
        "layer_level": 2,
        "description": "Database layer",
      },
    )
    assert target_component.status_code == 201
    target_uid = target_component.json()["data"]["uid"]

    create_relationship = client.post(
      f"/api/v1/architecture/{graph_version_id}/relationships",
      headers=headers,
      json={
        "source_uid": source_uid,
        "target_uid": target_uid,
        "type": "ALLOWED_DEPENDENCY",
      },
    )
    assert create_relationship.status_code == 201

    graph_response = client.get(f"/api/v1/architecture/{graph_version_id}/graph", headers=headers)
    assert graph_response.status_code == 200
    assert graph_response.json()["data"]["stats"]["total_relationships"] == 1

    delete_relationship = client.delete(
      f"/api/v1/architecture/{graph_version_id}/relationships",
      headers=headers,
      params={
        "source_uid": source_uid,
        "target_uid": target_uid,
        "type": "ALLOWED_DEPENDENCY",
      },
    )
    assert delete_relationship.status_code == 200

    graph_after_delete = client.get(f"/api/v1/architecture/{graph_version_id}/graph", headers=headers)
    assert graph_after_delete.status_code == 200
    assert graph_after_delete.json()["data"]["stats"]["total_relationships"] == 0

    upload_contract = client.post(
      f"/api/v1/projects/{graph_project_id}/uploads/contracts",
      headers=headers,
      json={
        "filename": "architecture-design.pdf",
        "content_type": "application/pdf",
        "size_bytes": 1024,
      },
    )
    assert upload_contract.status_code == 201
    contract_data = upload_contract.json()["data"]
    assert contract_data["filename"] == "architecture-design.pdf"
    assert contract_data["content_type"] == "application/pdf"
    assert contract_data["method"] == "PUT"
    assert contract_data["upload_url"].startswith("/api/v1/projects/")

    document_upload = client.post(
      f"/api/v1/projects/{graph_project_id}/documents/upload",
      headers=headers,
      files={"file": ("architecture-v3.png", b"diagram-bytes", "image/png")},
      data={"file_type": "diagram", "description": "System diagram"},
    )
    assert document_upload.status_code == 200 or document_upload.status_code == 201
    document_data = document_upload.json()["data"]
    assert document_data["file_name"] == "architecture-v3.png"
    assert document_data["file_type"] == "diagram"
    assert document_data["processing_status"] == "pending"

    process_document_inline = client.post(
      f"/api/v1/projects/{graph_project_id}/documents/{document_data['id']}/process",
      headers=headers,
      json={"mode": "inline"},
    )
    assert process_document_inline.status_code == 200
    processed_document = process_document_inline.json()["data"]
    assert processed_document["processing_status"] == "completed"
    assert processed_document["extracted_data"]["source"] == "scaffolded-inline-extractor"

    background_document_upload = client.post(
      f"/api/v1/projects/{graph_project_id}/documents/upload",
      headers=headers,
      files={"file": ("background-worker.txt", b"background bytes", "text/plain")},
      data={"file_type": "text", "description": "Background processing contract"},
    )
    assert background_document_upload.status_code == 200 or background_document_upload.status_code == 201
    background_document_id = background_document_upload.json()["data"]["id"]

    process_document_background = client.post(
      f"/api/v1/projects/{graph_project_id}/documents/{background_document_id}/process",
      headers=headers,
      json={"mode": "background"},
    )
    assert process_document_background.status_code == 200
    process_background_payload = process_document_background.json()["data"]
    assert process_background_payload["document_id"] == background_document_id
    assert process_background_payload["processing_status"] == "processing"
    assert process_background_payload["queue_backend"] in {"celery", "fastapi-background"}

    background_document_details = client.get(
      f"/api/v1/projects/{graph_project_id}/documents/{background_document_id}",
      headers=headers,
    )
    assert background_document_details.status_code == 200
    job_meta = background_document_details.json()["data"]["extracted_data"]["job"]
    assert job_meta["mode"] == "background"
    assert job_meta["status"] in {"queued", "completed", "failed"}
    assert job_meta["queue_backend"] in {"celery", "fastapi-background"}

    background_job_status = client.get(
      f"/api/v1/projects/{graph_project_id}/documents/{background_document_id}/job",
      headers=headers,
    )
    assert background_job_status.status_code == 200
    job_status_data = background_job_status.json()["data"]
    assert job_status_data["document_id"] == background_document_id
    assert job_status_data["job"]["mode"] == "background"
    assert job_status_data["runtime_state"] is None or isinstance(job_status_data["runtime_state"], str)
    diagnostics = job_status_data["extractor_diagnostics"]
    assert "provider_name" in diagnostics
    assert "provider_endpoint" in diagnostics
    assert "provider_attempts" in diagnostics
    assert "request_id" in diagnostics
    assert "key_slot" in diagnostics
    assert "error_code" in diagnostics
    diagnostics_history = job_status_data["extractor_diagnostics_history"]
    assert isinstance(diagnostics_history, list)
    assert len(diagnostics_history) >= 1
    assert diagnostics_history[-1]["event"] == "processing_queued"
    assert diagnostics_history[-1]["trigger"] == "document-process-api"

    failed_document_upload = client.post(
      f"/api/v1/projects/{graph_project_id}/documents/upload",
      headers=headers,
      files={"file": ("failed-replay.txt", b"failed bytes", "text/plain")},
      data={"file_type": "text", "description": "Dead-letter replay candidate"},
    )
    assert failed_document_upload.status_code == 200 or failed_document_upload.status_code == 201
    failed_document_id = failed_document_upload.json()["data"]["id"]

    mark_failed = client.patch(
      f"/api/v1/projects/{graph_project_id}/documents/{failed_document_id}/status",
      headers=headers,
      json={"new_status": "failed"},
    )
    assert mark_failed.status_code == 200

    seed_failure_metadata = client.patch(
      f"/api/v1/projects/{graph_project_id}/documents/{failed_document_id}/extracted-data",
      headers=headers,
      json={
        "extracted_data": {
          "source": "document-extractor",
          "error": {
            "code": "EXTRACTOR_HTTP_TIMEOUT",
            "message": "Extractor request timed out",
            "retryable": True,
            "details": {"attempt": 3},
          },
          "dead_letter": {
            "retryable": True,
            "failed_at": "2026-04-19T00:00:00+00:00",
            "replay_count": 0,
            "status": "ready_for_replay",
          },
        }
      },
    )
    assert seed_failure_metadata.status_code == 200

    dead_letter_items = client.get(
      f"/api/v1/projects/{graph_project_id}/documents/dead-letter",
      headers=headers,
    )
    assert dead_letter_items.status_code == 200
    dead_letter_payload = dead_letter_items.json()["data"]
    replay_candidate = next(item for item in dead_letter_payload["items"] if item["document_id"] == failed_document_id)
    assert replay_candidate["retryable"] is True
    assert replay_candidate["error_code"] == "EXTRACTOR_HTTP_TIMEOUT"
    assert replay_candidate["replay_count"] == 0

    replay_response = client.post(
      f"/api/v1/projects/{graph_project_id}/documents/{failed_document_id}/replay",
      headers=headers,
      json={"allow_non_retryable": False},
    )
    assert replay_response.status_code == 200
    replay_payload = replay_response.json()["data"]
    assert replay_payload["document_id"] == failed_document_id
    assert replay_payload["processing_status"] == "processing"
    assert replay_payload["replay_count"] == 1
    assert replay_payload["queue_backend"] in {"celery", "fastapi-background"}

    replayed_document_details = client.get(
      f"/api/v1/projects/{graph_project_id}/documents/{failed_document_id}",
      headers=headers,
    )
    assert replayed_document_details.status_code == 200
    replay_history = replayed_document_details.json()["data"]["extracted_data"].get("extractor_diagnostics_history")
    assert isinstance(replay_history, list)
    assert len(replay_history) >= 1
    assert replay_history[-1]["event"] == "replay_queued"
    assert replay_history[-1]["trigger"] == "document-replay-api"

    replay_worker_ops = client.get("/api/v1/analytics/worker-ops", headers=headers)
    assert replay_worker_ops.status_code == 200
    replay_worker_ops_data = replay_worker_ops.json()["data"]
    assert replay_worker_ops_data["last_replay_requested_at"] is not None
    assert replay_worker_ops_data["last_replay_document_count"] >= 1

    bulk_replay_action = client.post(
      "/api/v1/analytics/worker-actions/replay-retryable",
      headers=headers,
      json={"project_id": graph_project_id, "limit": 20, "allow_non_retryable": False},
    )
    assert bulk_replay_action.status_code == 429
    bulk_error = bulk_replay_action.json()["detail"]
    assert bulk_error["code"] == "RATE_LIMITED"
    assert bulk_error["retry_after_seconds"] >= 1
    assert "next_available_at" in bulk_error

    list_documents = client.get(f"/api/v1/projects/{graph_project_id}/documents", headers=headers)
    assert list_documents.status_code == 200
    assert list_documents.json()["pagination"]["total_items"] >= 1

    search_documents = client.get(
      f"/api/v1/projects/{graph_project_id}/documents",
      headers=headers,
      params={"search": "dependency graph"},
    )
    assert search_documents.status_code == 200
    search_payload = search_documents.json()
    assert search_payload["pagination"]["total_items"] == 1
    assert search_payload["data"][0]["id"] == document_data["id"]

    document_id = document_data["id"]
    get_document = client.get(f"/api/v1/projects/{graph_project_id}/documents/{document_id}", headers=headers)
    assert get_document.status_code == 200
    assert get_document.json()["data"]["id"] == document_id

    summary_after_document_completion = client.get("/api/v1/analytics/summary", headers=headers)
    assert summary_after_document_completion.status_code == 200
    summary_data = summary_after_document_completion.json()["data"]
    assert summary_data["total_documents"] == 3
    assert summary_data["completed_documents"] >= 1
    assert (
      summary_data["pending_documents"]
      + summary_data["processing_documents"]
      + summary_data["completed_documents"]
      + summary_data["failed_documents"]
    ) == summary_data["total_documents"]

    document_trends_after_processing = client.get("/api/v1/analytics/documents/trends?days=14", headers=headers)
    assert document_trends_after_processing.status_code == 200
    trend_points_after_processing = document_trends_after_processing.json()["data"]["points"]
    assert len(trend_points_after_processing) >= 1
    latest_point = trend_points_after_processing[-1]
    assert "uploaded_delta_day_over_day" in latest_point
    assert "completed_delta_day_over_day" in latest_point
    assert "failed_delta_day_over_day" in latest_point
    assert "processing_delta_day_over_day" in latest_point
    if latest_point["success_rate_percent"] is not None:
      assert 0.0 <= latest_point["success_rate_percent"] <= 100.0
    if latest_point["failure_rate_percent"] is not None:
      assert 0.0 <= latest_point["failure_rate_percent"] <= 100.0

    reprocess_without_force = client.post(
      f"/api/v1/projects/{graph_project_id}/documents/{document_id}/process",
      headers=headers,
      json={"mode": "inline"},
    )
    assert reprocess_without_force.status_code == 409
    reprocess_error = reprocess_without_force.json()["detail"]
    assert reprocess_error["code"] == "INVALID_STATE"

    invalid_transition = client.patch(
      f"/api/v1/projects/{graph_project_id}/documents/{document_id}/status",
      headers=headers,
      json={"new_status": "processing"},
    )
    assert invalid_transition.status_code == 409
    error = invalid_transition.json()["detail"]
    assert error["code"] == "INVALID_TRANSITION"

    delete_document = client.delete(f"/api/v1/projects/{graph_project_id}/documents/{document_id}", headers=headers)
    assert delete_document.status_code == 200

    delete_background_document = client.delete(
      f"/api/v1/projects/{graph_project_id}/documents/{background_document_id}",
      headers=headers,
    )
    assert delete_background_document.status_code == 200

    delete_failed_document = client.delete(
      f"/api/v1/projects/{graph_project_id}/documents/{failed_document_id}",
      headers=headers,
    )
    assert delete_failed_document.status_code == 200

    missing_document = client.get(f"/api/v1/projects/{graph_project_id}/documents/{document_id}", headers=headers)
    assert missing_document.status_code == 404
