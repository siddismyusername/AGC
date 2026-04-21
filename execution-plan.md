# ArchGuard Execution Plan

This plan tracks actual implementation progress against the PRD and defines the next high-quality execution slices.

## Current Stage (April 20, 2026)

## Same-Day Completion Priority (April 21, 2026)

P0 (must complete first):
- Extraction provider production path: run trained model endpoint whenever configured; avoid accidental scaffold-only runs.
- OCR production path: automatically use OCR HTTP endpoint when configured and keep deterministic fallback when not.
- End-to-end contract integrity: preserve API response envelopes and diagnostics fields through extraction and review flows.
- Regression confidence: lock provider auto-mode behavior with focused unit tests and run targeted backend suites.

P1 (complete after P0):
- CI/CD strictness hardening: ensure compliance-trigger paths and failure semantics are deterministic for pipeline consumers.
- Dashboard governance parity: ensure acceptance/rejection trend, diagnostics history, and violation context remain fully wired.

P2 (if time remains today):
- Extended observability polish for replay/worker operations and runbook guidance.

April 21 execution status update:
- P0 extraction provider production path: completed (default provider now `auto`, prefers trained HTTP endpoint when configured, deterministic scaffold fallback).
- P0 OCR production path: completed (default OCR provider now `auto`, prefers HTTP OCR when configured, deterministic disabled fallback).
- P0 contract integrity: completed for extraction/review/job diagnostics payloads in targeted validation scope.
- P0 regression confidence: completed for targeted suite (`21 passed`) after starting required infra (`postgres`, `neo4j`, `redis`).
- P1 completed: CI/CD webhook strictness and dashboard governance parity are wired and contract-validated.
- P2 completed: replay/worker observability and runbook guidance are wired and validated through backend integration coverage.

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
- Extracted document trend calculation into a reusable helper for contract-level validation.
- Added focused trend contract tests for first-bucket zero deltas, percentage math, and null-percentage edge cases.
- Added extractor diagnostics exposure in job observability API (`request_id`, `key_slot`, provider attempts, error code).
- Added Documents UI diagnostics line for support troubleshooting (request trace, auth key slot, attempts, error code).
- Added integration assertions ensuring diagnostics contract is always present on job status payload.
- Added worker/queue replay action API: `POST /api/v1/analytics/worker-actions/replay-retryable`.
- Added Documents UI dead-letter replay controls with per-item replay and bulk retryable replay action.
- Extended backend smoke/integration coverage for worker replay action endpoint contract.
- Added dashboard extractor diagnostics panel showing latest live request trace, auth key slot, attempts, and retryability.
- Added worker replay cooldown rate limiting for bulk and single replay actions with 429 retry-after responses.
- Added replay activity telemetry to worker ops hints and dashboard ops panel showing latest replay timestamp and document count.
- All 5 backend tests passing with document status workflow coverage.
- Added Phase 4 AI extraction endpoints for deterministic text-to-rule and text-to-entity analysis.
- Added optional AI rule auto-create flow into architecture versions with backend integration coverage.
- Added Phase 4 document-native AI extraction endpoints that analyze uploaded document context and persist ai_candidates metadata.
- Added Documents UI AI Extract action with architecture version targeting and optional auto-rule creation.
- Added upload intake parsing (fingerprint, format detection, and text preview extraction) so document AI extraction consumes content-derived metadata.
- Added OCR provider scaffold (`disabled`/`http`) and OCR metadata persistence under `extracted_data.upload_intake`.
- Extended document AI extraction input assembly to consume OCR previews when available.
- Added diagram-structure hint extraction (`components` and `relationships`) from text/OCR previews in upload intake.
- Extended document AI extraction input assembly to consume diagram hints for stronger rule/entity candidate generation.
- Added diagram-hint apply endpoint to promote upload hints into intended graph components/relationships with document-level apply metadata tracking.
- Added Documents UI "Apply Hints" action to call diagram-hint apply endpoint and surface inline apply-state metadata per document.
- Added selective diagram-hint apply payload support (`selected_components`, `selected_relationships`) plus Documents review drawer for per-item approval before apply.
- Added integration coverage for selective diagram-hint apply behavior.
- Added persisted diagram review decisions (`accepted`/`rejected` hints + optional note) under `extracted_data.upload_intake.diagram_hint_reviews` and surfaced recent review history in Documents review drawer.
- Added reviewer identity context in review history UI (shows current user as self and falls back to reviewer id snippet).
- Added organization members directory endpoint (`GET /api/v1/organizations/me/members`) and Documents review-history identity resolution to show non-self reviewer name/email when available.
- Added reviewer role/active-status badges in Documents review history entries for stronger governance context.
- Reused shared reviewer identity/role/status chips across dashboard audit timeline rows and document-level activity summaries.
- Added shared governance activity row component and reused it in dashboard recent activity plus rule-editor audit drill-down.
- Added Documents activity timeline panel that reuses shared governance activity rows for current-view document audit events.
- Consolidated duplicated session-user and organization-member loading into shared frontend governance context hook reused by dashboard, documents, and rules pages.
- Consolidated audit-event loading into shared frontend hook (`use-audit-events`) and wired it across dashboard/documents/rules with contextual filtering and refresh.
- Added durable `extractor_diagnostics_history` persistence across process/replay flows and exposed it in document job-status responses with integration assertions.
- Surfaced extractor diagnostics history timelines in Documents job-state rows and Dashboard latest-trace panel.
- Staged AI candidate review contract with new endpoint to persist accepted/rejected rule/entity/relationship decisions and review history on documents.
- Wired Documents AI candidate review UI with accept/reject controls, reviewer notes, and persisted review-history rendering.
- Stabilized Documents polling by coalescing in-flight reloads, merging duplicate poll loops, and reducing audit/dead-letter refresh churn during background job tracking.
- Added Documents live-polling visibility controls with status indicator, cadence selector (off/2s/5s/10s), and manual refresh action.
- Added frontend Create Project modal on Documents page so active projects can be created without Swagger.
- Added AI candidate-review analytics endpoint plus dashboard/Documents accept-reject trend surfaces.

In progress:
- Document and image ingestion pipelines.
- AI-assisted extraction and multimodal layers (initial text extraction slice implemented).
- Advanced trend analytics and forecasting.

## Immediate Next Actions

1. **Expand Phase 4 AI ingestion** - Add production OCR provider integration and durable diagram parser integration for richer multimodal ingestion.
2. **Expand shared governance hook coverage** - Extend shared loading to include controlled polling/throttling primitives where practical.
3. **Broaden document replay history** - Add durable project-level replay history if analytics depth becomes necessary.
4. **Add candidate-review governance analytics** - Summarize AI review acceptance/rejection trends in dashboard activity and analytics.

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
- Forecast architecture drift and compliance risk using longer-horizon trend models.
- Add project-level replay analytics with durable history and operator drill-down.
- Build extractor reliability dashboards for failure cohorts, retries, and recovery windows.
- Expand governance activity analytics with richer slices by entity, severity, and reviewer role.