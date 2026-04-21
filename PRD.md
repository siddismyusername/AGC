# ArchGuard - Product Requirements & Technical Specification

## 1. Executive Summary

**Project Name:** AI-Driven Architecture Governance & Conformance Platform

The **AI-Driven Architecture Governance & Conformance Platform** is a multi-project system designed to make software architecture executable, enforceable, and intelligent. It bridges the gap between architectural documentation and actual code by extracting intent from text/diagrams and enforcing it through CI/CD pipelines.

By leveraging **Graph Theory** (Neo4j for structural modeling), **NLP** (Transformers for rule extraction), and **Computer Vision** (for diagram analysis), this platform solves the problem of "architecture drift" where code diverges from the intended design over time.

## 2. Problem Statement

In modern software development, architecture documentation (wikis, diagrams) is static and disconnected from the codebase:

- **Drift**: Code evolves faster than documentation, leading to silent violations (e.g., circular dependencies, layer skipping).
- **Manual Review**: Architects cannot manually review every PR for structural compliance.
- **Invisibility**: There is no live, queryable model of what the system *actually* looks like vs. what it *should* look like.

## 3. Target Audience

- **Software Architects**: To define rules, monitor drift, and enforce standards across multiple teams.
- **Developers**: To get immediate feedback on architecture violations during the commit/PR process.
- **DevOps/Platform Engineers**: To integrate automated governance into CI/CD pipelines.
- **Engineering Managers**: To view high-level compliance scores and technical debt metrics.

## 4. User Stories

### Architects
- As an architect, I want to define architecture rules in plain English (e.g., "Services must not call the Database directly") so that I don't have to learn a complex constraint language.
- As an architect, I want to see a visual graph of the current project structure to identify hotspots and cycles.
- As an architect, I want to receive alerts when a critical architecture rule is violated.

### Developers
- As a developer, I want my PR to fail or warn me if I introduce a forbidden dependency so I can fix it before merging.
- As a developer, I want to see exactly which line of code caused a violation so I can remediate it quickly.

### DevOps
- As a DevOps engineer, I want to plug this tool into GitHub Actions/GitLab CI with minimal configuration so it scales across all projects.

## 5. Functional Requirements

### 5.1 Core Platform (Deterministic)

| ID | Requirement | Priority |
|----|-------------|----------|
| **FR-01** | **Project Management**: Create/Edit/Delete projects with versioned architecture models. | P0 |
| **FR-02** | **Graph Storage**: Persist architecture components and relationships in Neo4j. | P0 |
| **FR-03** | **Static Analysis**: Parse source code (initially Python, extensible to others) to extract import/dependency graphs. | P0 |
| **FR-04** | **Compliance Engine**: Compare the "Intended Graph" (Architecture) vs. "Actual Graph" (Code) to detect violations. | P0 |
| **FR-05** | **Violation Detection**: Identify forbidden dependencies, missing dependencies, cycles, and layer skipping. | P0 |
| **FR-06** | **CI/CD Integration**: Provide a REST API and CLI/Script for CI/CD pipelines to trigger strict compliance checks. | P0 |
| **FR-07** | **Scoring**: Calculate an "Architecture Health Score" based on violation severity/density. | P1 |

### 5.2 AI Intelligence Layer

| ID | Requirement | Priority |
|----|-------------|----------|
| **FR-08** | **NLP Rule Extraction**: Convert natural language rules (e.g., "A depends on B") into structured graph queries/constraints. | P1 |
| **FR-09** | **Entity Recognition (NER)**: Automatically identify components (UI, Service, DB) from design documents. | P1 |
| **FR-10** | **Diagram Processing**: Detect components and relationships from image-based architecture diagrams. | P2 |
| **FR-11** | **Multimodal Alignment**: Correlate terms in text with shapes in diagrams to build a unified model. | P3 |

### 5.3 User Interface

| ID | Requirement | Priority |
|----|-------------|----------|
| **FR-12** | **Dashboard**: Visual summary of compliance status, recent violations, and project health trends. | P1 |
| **FR-13** | **Graph Visualization**: Interactive node-link diagram showing the architecture and violations. | P1 |
| **FR-14** | **Rule Editor**: Interface to manage text-based rules and review AI-extracted constraints. | P1 |

## 6. Non-Functional Requirements

- **Performance**:
  - API Response time < 500ms for 95th percentile.
  - UI Load time < 3s.
  - Compliance checks must complete within standard CI/CD timeout limits.
- **Scalability**: Horizontal scaling of worker nodes to handle concurrent CI jobs.
- **Security**: Role-Based Access Control (RBAC), encryption in transit and at rest.
- **Reliability**: Deterministic core must be 100% accurate; AI suggestions flagged as probabilistic.

## 7. Technical Architecture

### 7.1 Tech Stack

- **Backend**: Python 3.12+ (FastAPI, Celery)
- **Frontend**: Next.js, TypeScript, TailwindCSS, shadcn/ui
- **Database**:
  - **Graph**: Neo4j
  - **Relational**: PostgreSQL
  - **Cache/Queue**: Redis
- **Infrastructure**: Docker, Docker Compose

### 7.2 Key Components

1. **API Gateway**: Unified entry point
2. **Project Service**: Project/user management
3. **Modeling Service**: Neo4j graph management
4. **Analysis Service**: Language-specific parsers for code graphs
5. **Compliance Service**: Intent vs Actual comparison
6. **AI Worker**: NLP/CV tasks

---

## 8. API Specification

> Base URL: `https://api.archguard.dev/api/v1`
> Protocol: HTTPS (REST/JSON)
> Auth: Bearer JWT

### 8.1 Standard Response Format

```json
{
  "status": "success",
  "data": { ... },
  "meta": {
    "request_id": "uuid-v4",
    "timestamp": "2026-03-04T10:30:00Z"
  }
}
```

### 8.2 Error Format

```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error description",
    "details": [{ "field": "email", "message": "Invalid email format" }]
  }
}
```

### 8.3 Error Codes

| HTTP | Code | Description |
|------|------|-------------|
| 400 | VALIDATION_ERROR | Request validation failed |
| 401 | UNAUTHORIZED | Missing/invalid JWT |
| 401 | TOKEN_EXPIRED | Access token expired |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource doesn't exist |
| 409 | CONFLICT | Resource already exists |
| 429 | RATE_LIMITED | Too many requests |
| 500 | INTERNAL_ERROR | Server error |

### 8.4 Authentication

- **Access Token**: JWT (HS256), 30 min expiry
- **Refresh Token**: Opaque UUID, 7 days
- **Header**: `Authorization: Bearer <token>`

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/register | Create account |
| POST | /auth/login | Get tokens |
| POST | /auth/refresh | Rotate tokens |
| POST | /auth/logout | Revoke token |
| GET | /auth/me | Current user |

### 8.5 Projects

| Method | Path | Description |
|--------|------|-------------|
| POST | /projects | Create project |
| GET | /projects | List projects |
| GET | /projects/{id} | Get project |
| PUT | /projects/{id} | Update project |
| DELETE | /projects/{id} | Soft-delete |

### 8.6 Architecture Versions

| Method | Path | Description |
|--------|------|-------------|
| POST | /projects/{id}/architecture | Create version |
| GET | /projects/{id}/architecture | List versions |
| GET | /projects/{id}/architecture/{vid} | Get version |
| PATCH | /projects/{id}/architecture/{vid}/status | Transition status |

### 8.7 Rules

| Method | Path | Description |
|--------|------|-------------|
| POST | /architecture/{vid}/rules | Create rule |
| POST | /architecture/{vid}/rules/batch | Batch create |
| GET | /architecture/{vid}/rules | List rules |
| PUT | /architecture/{vid}/rules/{rid} | Update rule |
| DELETE | /architecture/{vid}/rules/{rid} | Deactivate |

### 8.8 Graph

| Method | Path | Description |
|--------|------|-------------|
| POST | /architecture/{vid}/components | Add component |
| GET | /architecture/{vid}/graph | Get graph |
| POST | /architecture/{vid}/relationships | Add relationship |
| DELETE | /architecture/{vid}/components/{uid} | Delete component |
| DELETE | /architecture/{vid}/relationships/{id} | Delete relationship |

### 8.9 Compliance

| Method | Path | Description |
|--------|------|-------------|
| POST | /projects/{id}/compliance/check | Trigger check |
| GET | /projects/{id}/compliance/reports | List reports |
| GET | /projects/{id}/compliance/reports/{rid} | Get report |
| GET | /projects/{id}/compliance/score | Health score |

### 8.10 Documents

| Method | Path | Description |
|--------|------|-------------|
| POST | /projects/{id}/documents | Upload document |
| GET | /projects/{id}/documents | List documents |
| GET | /projects/{id}/documents/{did} | Get document |
| DELETE | /projects/{id}/documents/{did} | Delete document |
| POST | /projects/{id}/documents/{did}/process | Process document |

### 8.11 Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | /analytics/summary | Dashboard summary |
| GET | /analytics/history | Trend history |
| GET | /analytics/worker-health | Worker status |

---

## 9. Database Schema

### 9.1 PostgreSQL Tables

- **organizations**: Multi-tenant organizations
- **users**: User accounts with roles
- **refresh_tokens**: Token management
- **projects**: Project definitions
- **architecture_versions**: Versioned architecture models
- **architecture_rules**: Rule definitions
- **pipelines**: CI/CD pipeline configs
- **ci_cd_tokens**: API tokens for CI
- **compliance_reports**: Check results
- **violations**: Detected violations
- **uploaded_documents**: Document metadata
- **audit_logs**: Activity tracking

### 9.2 Neo4j Graph

**Nodes:**
- `:IntendedComponent` - Architecture-defined components
- `:ActualComponent` - Extracted code components

**Relationships:**
- `[:ALLOWED_DEPENDENCY]` - Permitted dependencies
- `[:FORBIDDEN_DEPENDENCY]` - Prohibited dependencies
- `[:REQUIRES]` - Mandatory dependencies
- `[:LAYER_ABOVE]` - Layer ordering
- `[:DEPENDS_ON]` - Code dependencies
- `[:MAPS_TO]` - Intent-to-actual mapping

---

## 10. Development Roadmap

### Phase 1: Foundation (MVP)
- Setup Neo4j, Postgres, FastAPI
- Basic Auth & Project Management
- Python Static Analyzer
- Core Compliance
- Basic CI/CD Webhook

### Phase 2: Visualization & UI
- Next.js Dashboard
- Visual Graph Explorer
- Detailed Compliance Reports

### Phase 3: AI Augmentation
- NLP Rule Extraction
- NER Model
- Document upload & OCR

### Phase 4: Advanced Features
- Diagram parsing
- Multimodal alignment
- Advanced analytics

## 11. Success Metrics

- **Adoption**: Number of projects integrated
- **Catch Rate**: Violations prevented at PR stage
- **Accuracy**: F1 Score > 0.8 for NLP extraction
- **Performance**: Average CI check time < 2 mins