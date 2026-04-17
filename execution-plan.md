# ArchGuard Execution Plan

This plan follows the PRD and current repository state. The backend MVP is mostly in place, so the remaining work is ordered to first make the platform production-ready, then deliver the frontend, then add AI and advanced capabilities.

## Current State

- Backend foundation exists: auth, projects, graph storage, static analysis, compliance checks, and webhook endpoints.
- Frontend is not scaffolded yet.
- Alembic migration history is missing an initial migration.
- Automated tests are missing.
- AI intelligence endpoints and document/image ingestion flows are not implemented.

## Execution Goals

1. Make the backend reliable, testable, and migration-safe.
2. Deliver the first usable frontend dashboard.
3. Add document and image ingestion for architecture intent.
4. Implement AI-assisted rule extraction and diagram understanding.
5. Expand into advanced analytics and multimodal features.

## Phase 0: Delivery Foundations

### 0.1 Database and migrations

Tasks:
- Create the first Alembic migration for all current models.
- Verify upgrade and downgrade paths in Docker.
- Document migration workflow for local and CI usage.

Deliverables:
- One baseline migration checked into `alembic/versions/`.
- Repeatable database bootstrap for new environments.

Acceptance criteria:
- A clean database can be created from migrations only.
- Migration rollback does not break the schema.

### 0.2 Test harness

Tasks:
- Add unit tests for auth, project, graph, static analysis, and compliance services.
- Add API integration smoke tests for the main flows.
- Add fixtures for temporary Postgres and Neo4j data.

Deliverables:
- Test suite runnable locally and in CI.
- Coverage on the main user journeys.

Acceptance criteria:
- Core backend flows can be validated automatically.
- Failing paths produce actionable error output.

### 0.3 CI/CD baseline

Tasks:
- Add a pipeline to run linting, tests, and migration checks.
- Add build validation for backend container image.
- Add health checks for startup dependencies.

Deliverables:
- A repeatable CI job for backend validation.

Acceptance criteria:
- Pull requests cannot merge if tests or migrations fail.

## Phase 1: Backend Product Hardening

### 1.1 Authentication and authorization hardening

Tasks:
- Review token rotation and refresh token storage logic.
- Tighten role enforcement across routes.
- Add audit events for sign-in, sign-out, and privileged actions.

Deliverables:
- Safer auth flow with clearer failure modes.

Acceptance criteria:
- Unauthorized access is consistently blocked.
- Token refresh and logout behavior is deterministic.

### 1.2 Compliance reliability

Tasks:
- Improve compliance result persistence and error handling.
- Add pagination and filtering checks for reports and violations.
- Validate scoring behavior for critical, major, and minor issues.

Deliverables:
- Stable compliance reports with predictable scoring.

Acceptance criteria:
- Compliance runs always produce a stored report or a clear failure state.

### 1.3 API parity cleanup

Tasks:
- Add missing spec-backed endpoints for organizations and audit logs.
- Add dashboard/analytics summary endpoints.
- Align payloads and error envelopes with the API specification.

Deliverables:
- Backend API coverage closer to the PRD and spec.

Acceptance criteria:
- Frontend has the endpoints it needs for the MVP dashboard.

## Phase 2: Frontend MVP

### 2.1 App scaffold

Tasks:
- Create the Next.js application with TypeScript and TailwindCSS.
- Add shadcn/ui and a consistent design system.
- Establish API client, auth state, and routing.

Deliverables:
- A working frontend shell with authentication and protected routes.

Acceptance criteria:
- Users can sign in and reach the application shell.

### 2.2 Core pages

Tasks:
- Build Login, Dashboard, Projects, Project Detail, Reports, and Rules pages.
- Add loading, empty, and error states.
- Add responsive layouts for desktop and mobile.

Deliverables:
- Usable product surface for the main backend capabilities.

Acceptance criteria:
- A user can manage projects and view compliance output from the UI.

### 2.3 Graph explorer

Tasks:
- Add an interactive node-link view for intended vs actual architecture.
- Highlight violations and suspicious dependencies.
- Provide component and edge detail panels.

Deliverables:
- Visual architecture explorer in the frontend.

Acceptance criteria:
- Architects can inspect the graph without leaving the dashboard.

## Phase 3: Document and Image Inputs

### 3.1 Document ingestion

Tasks:
- Add document upload endpoints for markdown, text, and PDF.
- Store uploaded documents and processing metadata.
- Extract text and normalize it for downstream rule extraction.

Deliverables:
- Document upload and parsing flow.

Acceptance criteria:
- An uploaded document can be listed, processed, and linked to a project.

### 3.2 Diagram/image ingestion

Tasks:
- Add image upload endpoints for PNG, JPG, and SVG diagrams.
- Add preprocessing and OCR/object-detection pipeline hooks.
- Persist extracted components and relationships.

Deliverables:
- Architecture diagram ingestion flow.

Acceptance criteria:
- A diagram upload can produce a structured candidate graph.

### 3.3 Review workflow

Tasks:
- Add human review/approval for extracted components and rules.
- Track provenance from source document or image to extracted artifact.

Deliverables:
- Human-in-the-loop review for AI-assisted inputs.

Acceptance criteria:
- Extracted suggestions are reviewable before activation.

## Phase 4: AI Intelligence Layer

### 4.1 Rule extraction

Tasks:
- Implement NLP-based rule classification from plain English.
- Convert rules into structured constraints and graph queries.
- Version and evaluate extraction outputs.

Deliverables:
- Text-to-rule extraction service.

Acceptance criteria:
- Natural-language rules are transformed into usable architecture constraints.

### 4.2 Entity and relationship extraction

Tasks:
- Build architecture entity recognition from text.
- Extract component names, relations, and keywords.
- Add confidence scores and manual correction paths.

Deliverables:
- Component and relation extraction pipeline.

Acceptance criteria:
- Architecture documents yield structured entities consistently.

### 4.3 Diagram understanding

Tasks:
- Detect boxes, arrows, and labels in architecture diagrams.
- Reconstruct graphs from image inputs.
- Evaluate extraction accuracy against labeled samples.

Deliverables:
- Diagram-to-graph pipeline.

Acceptance criteria:
- Diagram images can be translated into candidate architecture graphs.

## Phase 5: Advanced Platform Features

### 5.1 Multimodal alignment

Tasks:
- Build paired text-image embedding workflow.
- Compare document and diagram semantics.
- Add retrieval and similarity-based assistance.

Deliverables:
- Research-oriented multimodal alignment layer.

Acceptance criteria:
- Related documents and diagrams can be matched with useful similarity signals.

### 5.2 Analytics and forecasting

Tasks:
- Add trend views for health score and violation density.
- Add project-level risk summaries.
- Add alerting hooks for repeated regressions.

Deliverables:
- Higher-level governance reporting.

Acceptance criteria:
- Managers can see drift trends and recurring problem areas.

## Suggested Milestones

### Milestone 1: Production-ready backend

Scope:
- Migrations
- Tests
- CI
- Auth/compliance hardening

### Milestone 2: Usable frontend

Scope:
- Next.js scaffold
- Dashboard
- Projects
- Reports
- Graph explorer

### Milestone 3: Document and image ingestion

Scope:
- Upload endpoints
- Parsing pipeline
- Review workflow

### Milestone 4: AI augmentation

Scope:
- NLP rule extraction
- Entity extraction
- Diagram processing

### Milestone 5: Advanced intelligence and analytics

Scope:
- Multimodal alignment
- Trend analytics
- Alerting and forecasting

## Dependency Order

1. Database migrations before broader testing.
2. Test harness before frontend integration work.
3. Backend API parity before frontend dashboard completion.
4. Document/image ingestion before AI extraction.
5. AI extraction before multimodal alignment and forecasting.

## Immediate Next Actions

1. Create the baseline Alembic migration.
2. Add the first backend tests for auth and compliance.
3. Scaffold the frontend app.
4. Add document and image upload contracts to the API.