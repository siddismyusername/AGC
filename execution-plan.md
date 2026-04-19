# ArchGuard Execution Plan

This plan tracks actual implementation progress against the PRD and defines the next high-quality execution slices.

## Current Stage (April 18, 2026)

Completed:
- Backend MVP is running with auth, projects, graph, compliance, and webhooks.
- Initial Alembic migration exists and applies cleanly.
- Baseline backend tests pass.
- Frontend Next.js app is scaffolded with landing, login, and dashboard pages.
- Frontend-backend integration is active for auth and dashboard project/health data.
- Phase 3 document ingestion backend endpoints and frontend UI deployed.

In progress:
- Frontend auth UX hardening (first-time registration, guarded routes, token refresh).
- Replacing placeholder dashboard activity with real backend audit events.
- API parity work for PRD modules (organizations, analytics, audit maturity).
- Phase 3 document upload scaffolding is now starting with backend document metadata persistence.

## Execution Log (April 18, 2026)

Completed in this run:
- Docker services confirmed running (`postgres`, `neo4j`, `redis`).
- Backend verification gap closed: backend tests now pass with Neo4j available (`4 passed`).
- Restored and implemented organizations API endpoints:
	- `GET /api/v1/organizations/me`
	- `PATCH /api/v1/organizations/me`
- Implemented analytics summary endpoint:
	- `GET /api/v1/analytics/summary`
- Extended audit logging beyond auth actions to include project/rule/version mutations.
- Updated API smoke test coverage to assert organization and analytics routes.
- Wired frontend dashboard summary cards to `/api/v1/analytics/summary`.
- Added frontend organization settings page wired to `/api/v1/organizations/me`.
- Added focused backend integration test coverage for organization + analytics endpoints.
- Enriched audit payloads for update/deactivate actions with `old_value` + `new_value` diffs.
- Wired dashboard activity rendering to show human-readable field change details.
- Added integration assertion for audit diff payload on `project.update` events.
- Added analytics trend history endpoint: `GET /api/v1/analytics/history?days=14`.
- Wired dashboard trend panel to live analytics history data.
- Extended smoke and integration tests for analytics history route and response shape.
- Added negative-path authorization/conflict coverage for organizations, projects, and analytics in integration tests.
- Delivered first FR-13 frontend graph explorer slice at `/architecture/graph` using existing graph APIs.
- Delivered first FR-14 frontend rule editor slice at `/architecture/rules` with create/list/update/deactivate and full error handling.
- Expanded FR-13 graph explorer with component create/delete and relationship create workflows.
- Expanded FR-13 graph explorer with relationship edit/delete workflows.
- Expanded FR-14 rule editor with search/filter controls and bulk deactivate action.
- Expanded FR-14 rule editor with client-side pagination and audit drill-down.
- Added backend regression coverage for graph relationship delete and upload contract scaffolding in the consolidated organization + analytics integration test.
- Added backend regression coverage for document upload, list, get, and delete in the consolidated organization + analytics integration test.
- Added backend document ingestion model, migration, and endpoints for Phase 3 upload/list/get/delete.
- Added frontend document management page with upload form, list view, filtering, search, and delete capability.
- Wired documents page to backend API with token refresh and error handling.
- Updated dashboard navigation to include Documents link.
- Added PATCH endpoint for document processing status transitions (pending → processing → completed → terminal).
- Added document search across file metadata and extracted_data plus extracted-data update endpoint for Phase 3 scaffolding.
- Extended integration coverage for extracted_data-powered search.
- Validated status transition state machine with integration tests.
- Enhanced analytics summary with document status metrics (total, pending, processing, completed, failed).
- Added dashboard document summary card wired to live analytics data.
- Extended integration coverage to validate analytics document metrics lifecycle.
- Added Phase 4 extraction scaffolding service with deterministic extracted_data payload generation.
- Added document processing trigger endpoint with inline/background modes: `POST /api/v1/projects/{project_id}/documents/{doc_id}/process`.
- Extended integration coverage for processing lifecycle, including terminal-state reprocess guardrails.
- Added frontend document process/reprocess controls wired to processing endpoint.
- Added automatic document list refresh while items are in processing state.
- Added Celery app wiring for document processing queue (`REDIS_URL` broker/backend).
- Replaced background processing mode with Celery task dispatch and resilient local fallback.
- Persisted extraction job metadata (`task_id`, queue backend, queued/completed status) under document extracted_data.
- Added local worker runbook commands for Celery startup on Windows (solo pool) in project command guide.
- Added extraction provider adapter architecture (`scaffolded` and external `http`) via environment-driven config.
- Added provider metadata and optional confidence support in extracted payloads for Phase 4 readiness.
- Added extraction job observability endpoint: `GET /api/v1/projects/{project_id}/documents/{doc_id}/job`.
- Added integration coverage for persisted job metadata plus runtime queue state visibility.
- Added analytics worker health endpoint: `GET /api/v1/analytics/worker-health`.
- Added analytics document trend endpoint: `GET /api/v1/analytics/documents/trends?days=14`.
- Exposed job observability in Documents UI with runtime state and retry hints.
- Added dashboard worker health panel and document metrics trend panel wired to backend data.
- Hardened HTTP extractor reliability with retry/backoff policy and structured failure taxonomy.
- Added extraction-service unit tests for transient retry success and non-retryable response failures.
- Enforced concrete HTTP extractor response contract with schema validation for summary/keywords/rules/entities/relationships.
- Normalized AI extraction outputs into `rule_candidates`, `entity_candidates`, and `relationship_candidates` for downstream ingestion.
- Added external extractor provider auth hardening with request correlation headers and idempotency key propagation.
- Added primary/secondary API key rotation support (automatic fallback on auth rejection).
- Added extractor runbook coverage for provider header modes and key rotation cutover steps.
- Added worker operations hints endpoint: `GET /api/v1/analytics/worker-ops`.
- Added dashboard worker recovery actions panel with status-based runbook commands.
- Added smoke and integration coverage for worker operations hints endpoint contract.
- Added dead-letter endpoint for failed documents: `GET /api/v1/projects/{project_id}/documents/dead-letter`.
- Added controlled replay endpoint for failed documents: `POST /api/v1/projects/{project_id}/documents/{doc_id}/replay`.
- Persisted dead-letter metadata on extraction failure (`retryable`, `failed_at`, `replay_count`, `status`).
- Added integration coverage for dead-letter listing and replay queueing lifecycle.
- Refined document trend analytics with day-over-day deltas for uploaded/completed/failed/processing counts.
- Added document success-rate and failure-rate percentages to trend points.
- Updated dashboard trend panel to surface completion momentum and daily success-rate context.
- Added extractor diagnostics exposure in job observability API (`request_id`, `key_slot`, provider attempts, error code).
- Added Documents UI diagnostics line for support troubleshooting (request trace, auth key slot, attempts, error code).
- Added integration assertions ensuring diagnostics contract is always present on job status payload.
- Added worker/queue replay action API: `POST /api/v1/analytics/worker-actions/replay-retryable`.
- Added Documents UI dead-letter replay controls with per-item replay and bulk retryable replay action.
- Extended backend smoke/integration coverage for worker replay action endpoint contract.
- All 5 backend tests passing with document status workflow coverage.

Not started:
- Document and image ingestion pipelines.
- AI-assisted extraction and multimodal layers.
- Advanced trend analytics and forecasting.

## Immediate Next Actions

1. **Harden trend analytics contract tests** - Add focused assertions for first-bucket delta defaults and percentage math edges.
2. **Expand extractor diagnostics panels** - Surface provider diagnostics in dashboard-level operational views.
3. **Add worker action rate limiting** - Prevent accidental high-volume replay bursts per project.
4. **Expose replay activity telemetry** - Show last bulk replay outcomes on dashboard operations panels.

## Quality Gates (Always-On)

1. No feature is complete without backend and frontend error-state handling.
2. All new API routes must return standardized envelope/meta structures.
3. Auth/session flows must be deterministic under token expiry and refresh.
4. Every completed slice must have at least one test path (unit or integration).
5. No static mock text in production dashboards when backend data exists.

## Active Sprint: Frontend Auth + Activity Reliability

### Sprint Goals

1. First-time setup should be possible from UI only (no manual API call).
2. Dashboard activity must use real backend audit events.
3. Protected frontend routes must enforce valid sessions and refresh tokens.

### Work Items

1. Registration UX
- Add a dedicated Register page.
- Call backend `/auth/register` and persist returned tokens.
- Redirect directly to dashboard on success.

2. Route Guards
- Add protected-route guard component for dashboard and future protected pages.
- Validate session using `/auth/me`.
- Redirect unauthorized users to login.

3. Token Refresh
- Centralize token storage/session helpers in frontend API layer.
- Retry authorized API calls once after `/auth/refresh` on 401.
- Clear session and redirect when refresh fails.

4. Audit Activity Data
- Add backend audit events endpoint.
- Record core auth audit events (register/login/refresh/logout).
- Replace dashboard fallback activity copy with live API data and empty-state handling.

### Acceptance Criteria

1. A new user can register from UI and reach dashboard without using Swagger or curl.
2. Expired access tokens refresh transparently while browsing dashboard.
3. Invalid refresh token forces clean sign-out and login redirect.
4. Dashboard “Recent activity” renders backend audit events only.
5. UI remains responsive with loading, empty, and error states.

## Next Sprint: API Parity and Governance Surface

1. Add organizations endpoints and frontend organization context.
2. Add dashboard analytics summary endpoint for trend cards.
3. Expand audit coverage to privileged actions (project/rule/version changes).
4. Add tests for audit endpoint filtering/pagination.

## Phase Roadmap (PRD-Aligned)

## PRD Requirement Traceability

- FR-01 Project Management (P0): implemented (`/projects`, architecture versions, rules CRUD).
- FR-02 Graph Storage (P0): implemented baseline Neo4j graph endpoints/service.
- FR-03 Static Analysis (P0): implemented Python static analyzer service.
- FR-04 Compliance Engine (P0): implemented baseline intent-vs-actual comparison API.
- FR-05 Violation Detection (P0): implemented core violation categorization in compliance flow.
- FR-06 CI/CD Integration (P0): implemented webhook/API trigger surface (CLI script pending).
- FR-07 Scoring (P1): implemented health score endpoints and dashboard summary usage.
- FR-08 NLP Rule Extraction (P1): not started (Phase 4).
- FR-09 Entity Recognition (P1): not started (Phase 4).
- FR-10 Diagram Processing (P2): not started (Phase 4).
- FR-11 Multimodal Alignment (P3): not started (Phase 4 research).
- FR-12 Dashboard (P1): implemented and wired to live backend data.
- FR-13 Graph Visualization (P1): implemented frontend explorer slice with create/delete component and relationship create/edit/delete workflows.
- FR-14 Rule Editor (P1): implemented frontend editor slice with list/create/update/deactivate, search/filter, pagination, and audit drill-down.

## 48-Hour Delivery Mode (Quality Preserved)

Objective: maximize PRD completion in 2 days without degrading reliability, performance, or test discipline.

Day 1 (P0 closure and reliability):
- Finalize FR-01 through FR-06 deterministic flows with strict API behavior checks.
- Add negative-path authorization/conflict tests for organizations, projects, and analytics routes.
- Add baseline performance instrumentation and timing logs for summary/audit endpoints.

Day 2 (P1 surface completion):
- Complete FR-12 dashboard parity (summary + trend + activity + error states).
- Deliver first frontend slice for FR-13 graph visualization using existing graph APIs.
- Deliver first frontend slice for FR-14 rule editor (list/create/update/deactivate rules).

Deferred beyond 48 hours (cannot be completed to quality bar in 2 days):
- FR-08 NLP Rule Extraction.
- FR-09 Entity Recognition.
- FR-10 Diagram Processing.
- FR-11 Multimodal Alignment.

Quality guardrails for 48-hour mode:
- No untested endpoint merges.
- No placeholder dashboard data where APIs exist.
- No silent auth fallback behavior.
- No schema or envelope contract drift.

### Phase 1: Backend Hardening
- Auth and session hardening complete.
- Audit logging and API parity.
- CI gating for tests + migrations.

### Phase 2: Frontend MVP Completion
- Dashboard, projects, reports, and graph explorer parity.
- Role-aware UI controls.
- Production-ready UX states.

### Phase 3: Document and Image Inputs
- Upload contracts and storage metadata.
- Parsing/OCR hooks and review workflow.

### Phase 4: AI Intelligence Layer
- Rule/entity extraction.
- Diagram-to-graph reconstruction.

### Phase 5: Advanced Analytics
- TImplement document processing status update workflow (pending → completed).
2. Add document search and text extraction scaffolding for Phase 3 AI layer.
3. Enhance dashboard with document upload summary card.
4. Plan Phase 4 AI extraction integration (NLP/OCR hooks)
1. Expand audit payload richness (diff details for rule/version updates) and validate dashboard rendering.
2. Start document and image ingestion contracts (Phase 3 kickoff).
3. Extend upload-contract scaffolding into document and image ingestion entry points.
4. Add backend coverage for Phase 3 upload metadata flows.