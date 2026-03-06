# API Specification & Data Models
## AI-Driven Architecture Governance & Conformance Platform

> Version: 1.0.0  
> Base URL: `https://api.archguard.dev/api/v1`  
> Protocol: HTTPS (REST/JSON)  
> Auth: Bearer JWT

---

## Table of Contents

1. [Standard Response & Error Format](#1-standard-response--error-format)
2. [Authentication Flow & JWT Lifecycle](#2-authentication-flow--jwt-lifecycle)
3. [PostgreSQL Schema](#3-postgresql-schema)
4. [Neo4j Graph Schema](#4-neo4j-graph-schema)
5. [REST API Endpoints](#5-rest-api-endpoints)
   - 5.1 [Authentication](#51-authentication)
   - 5.2 [Organizations](#52-organizations)
   - 5.3 [Projects](#53-projects)
   - 5.4 [Architecture Versions](#54-architecture-versions)
   - 5.5 [Architecture Rules](#55-architecture-rules)
   - 5.6 [Architecture Graph (Neo4j)](#56-architecture-graph-neo4j)
   - 5.7 [Static Code Analysis](#57-static-code-analysis)
   - 5.8 [Compliance Engine](#58-compliance-engine)
   - 5.9 [AI Intelligence Services](#59-ai-intelligence-services)
   - 5.10 [CI/CD Pipelines & Webhooks](#510-cicd-pipelines--webhooks)
   - 5.11 [Document Management](#511-document-management)
   - 5.12 [Dashboard & Analytics](#512-dashboard--analytics)
   - 5.13 [Audit Logs](#513-audit-logs)
6. [CI/CD Webhook Payload Contracts](#6-cicd-webhook-payload-contracts)

---

## 1. Standard Response & Error Format

### 1.1 Success Response Envelope

All successful responses follow this structure:

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

For paginated lists:

```json
{
  "status": "success",
  "data": [ ... ],
  "meta": {
    "request_id": "uuid-v4",
    "timestamp": "2026-03-04T10:30:00Z"
  },
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total_items": 153,
    "total_pages": 8,
    "has_next": true,
    "has_prev": false
  }
}
```

### 1.2 Error Response Envelope

```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error description",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "INVALID_FORMAT"
      }
    ]
  },
  "meta": {
    "request_id": "uuid-v4",
    "timestamp": "2026-03-04T10:30:00Z"
  }
}
```

### 1.3 Error Codes & HTTP Status Mapping

| HTTP Status | Error Code | Description |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Request body/params failed validation |
| `400` | `BAD_REQUEST` | Malformed or semantically invalid request |
| `401` | `UNAUTHORIZED` | Missing or invalid JWT token |
| `401` | `TOKEN_EXPIRED` | JWT access token has expired |
| `403` | `FORBIDDEN` | User lacks permission for this action |
| `404` | `NOT_FOUND` | Resource does not exist |
| `409` | `CONFLICT` | Resource already exists or state conflict |
| `422` | `UNPROCESSABLE_ENTITY` | Semantically invalid (e.g., activating a deprecated version) |
| `429` | `RATE_LIMITED` | Too many requests |
| `500` | `INTERNAL_ERROR` | Unexpected server error |
| `502` | `SERVICE_UNAVAILABLE` | Downstream service (Neo4j, AI worker) unreachable |
| `504` | `TIMEOUT` | Compliance check or analysis exceeded time limit |

---

## 2. Authentication Flow & JWT Lifecycle

### 2.1 Token Architecture

| Token | Type | Lifetime | Storage |
|---|---|---|---|
| Access Token | JWT (HS256) | 30 minutes | `Authorization: Bearer <token>` header |
| Refresh Token | Opaque UUID | 7 days | HttpOnly cookie or request body |
| CI/CD Token | Scoped API Key | No expiry (revocable) | Pipeline secrets |

### 2.2 JWT Access Token Payload

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "architect",
  "org_id": "org-uuid",
  "iat": 1709540000,
  "exp": 1709541800,
  "jti": "unique-token-id"
}
```

### 2.3 Authentication Flow

```
┌──────────┐       POST /auth/login        ┌──────────┐
│  Client   │ ──────────────────────────────▶│  Server  │
│           │  { email, password }           │          │
│           │◀──────────────────────────────│          │
│           │  { access_token,              │          │
│           │    refresh_token,             │          │
│           │    expires_in: 1800 }         │          │
└──────────┘                                └──────────┘

Access Token Expired:

┌──────────┐    POST /auth/refresh          ┌──────────┐
│  Client   │ ──────────────────────────────▶│  Server  │
│           │  { refresh_token }             │          │
│           │◀──────────────────────────────│          │
│           │  { access_token (new),         │          │
│           │    refresh_token (rotated),    │          │
│           │    expires_in: 1800 }         │          │
└──────────┘                                └──────────┘

CI/CD Authentication:

┌──────────┐    Any API call                ┌──────────┐
│ CI Runner │ ──────────────────────────────▶│  Server  │
│           │  Header: X-API-Key: <token>    │          │
│           │  Header: X-Project-ID: <uuid>  │          │
└──────────┘                                └──────────┘
```

### 2.4 Refresh Token Rotation

- On each `/auth/refresh` call, the old refresh token is invalidated and a new one is issued.
- If a previously-used refresh token is presented, ALL tokens for that user are revoked (replay attack detection).

### 2.5 Role-Based Access Control (RBAC)

| Role | Permissions |
|---|---|
| `admin` | Full CRUD on org, projects, users. Manage pipelines. View audit logs. |
| `architect` | Create/edit architecture versions, rules, components. Trigger compliance. View reports. |
| `developer` | View projects, architecture, reports. Trigger compliance on own commits. |
| `devops` | Manage pipelines, CI/CD tokens. View compliance reports. |
| `viewer` | Read-only access to dashboards, reports, architecture. |

### 2.6 CI/CD Token Scoping

```json
{
  "token_id": "cicd-token-uuid",
  "project_id": "project-uuid",
  "permissions": ["compliance:trigger", "analysis:trigger", "reports:read"],
  "created_by": "user-uuid",
  "created_at": "2026-03-04T10:00:00Z",
  "last_used_at": "2026-03-04T12:00:00Z",
  "is_active": true
}
```

---

## 3. PostgreSQL Schema

### 3.1 ER Overview

```
organizations ─┬─── projects ─┬─── architecture_versions ─── architecture_rules
               │              ├─── pipelines
               │              ├─── compliance_reports ─── violations
               │              └─── uploaded_documents
               │
               └─── users
                       │
                       └─── refresh_tokens

Standalone:
  ├── ci_cd_tokens
  ├── audit_logs
  └── model_versions
```

### 3.2 Table Definitions

#### `organizations`

```sql
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_organizations_slug ON organizations(slug);
```

#### `users`

```sql
CREATE TYPE user_role AS ENUM ('admin', 'architect', 'developer', 'devops', 'viewer');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(320) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'developer',
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
```

#### `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    is_revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    replaced_by     UUID REFERENCES refresh_tokens(id)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

#### `projects`

```sql
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    repository_url  VARCHAR(2048),
    default_branch  VARCHAR(255) NOT NULL DEFAULT 'main',
    language        VARCHAR(50) NOT NULL DEFAULT 'python',
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_projects_creator ON projects(created_by);
```

#### `architecture_versions`

```sql
CREATE TYPE arch_status AS ENUM ('draft', 'under_review', 'approved', 'active', 'deprecated');

CREATE TABLE architecture_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_number  INTEGER NOT NULL,
    status          arch_status NOT NULL DEFAULT 'draft',
    description     TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at    TIMESTAMPTZ,

    UNIQUE(project_id, version_number)
);

CREATE INDEX idx_arch_versions_project ON architecture_versions(project_id);
CREATE INDEX idx_arch_versions_status ON architecture_versions(status);
```

#### `architecture_rules`

```sql
CREATE TYPE rule_type AS ENUM (
    'forbidden_dependency',
    'required_dependency',
    'layer_constraint',
    'cycle_prohibition',
    'naming_convention',
    'custom'
);

CREATE TYPE severity_level AS ENUM ('critical', 'major', 'minor');

CREATE TABLE architecture_rules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    architecture_version_id UUID NOT NULL REFERENCES architecture_versions(id) ON DELETE CASCADE,
    rule_text               TEXT NOT NULL,
    rule_type               rule_type NOT NULL,
    source_component        VARCHAR(255),
    target_component        VARCHAR(255),
    severity                severity_level NOT NULL DEFAULT 'major',
    is_ai_generated         BOOLEAN NOT NULL DEFAULT FALSE,
    confidence_score        FLOAT CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_by              UUID REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rules_version ON architecture_rules(architecture_version_id);
CREATE INDEX idx_rules_type ON architecture_rules(rule_type);
CREATE INDEX idx_rules_active ON architecture_rules(is_active) WHERE is_active = TRUE;
```

#### `pipelines`

```sql
CREATE TYPE ci_provider AS ENUM ('github_actions', 'gitlab_ci', 'jenkins', 'custom');

CREATE TABLE pipelines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    provider        ci_provider NOT NULL,
    webhook_secret  VARCHAR(255) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    config          JSONB DEFAULT '{}',
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pipelines_project ON pipelines(project_id);
```

#### `ci_cd_tokens`

```sql
CREATE TABLE ci_cd_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    permissions     TEXT[] NOT NULL DEFAULT ARRAY['compliance:trigger', 'reports:read'],
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID NOT NULL REFERENCES users(id),
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cicd_tokens_project ON ci_cd_tokens(project_id);
CREATE INDEX idx_cicd_tokens_hash ON ci_cd_tokens(token_hash);
```

#### `compliance_reports`

```sql
CREATE TYPE report_status AS ENUM ('pending', 'running', 'passed', 'failed', 'error');
CREATE TYPE trigger_type AS ENUM ('manual', 'ci_cd', 'scheduled');

CREATE TABLE compliance_reports (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    architecture_version_id UUID NOT NULL REFERENCES architecture_versions(id),
    pipeline_id             UUID REFERENCES pipelines(id),
    commit_hash             VARCHAR(40),
    branch                  VARCHAR(255),
    trigger                 trigger_type NOT NULL DEFAULT 'manual',
    status                  report_status NOT NULL DEFAULT 'pending',
    health_score            FLOAT CHECK (health_score >= 0.0 AND health_score <= 100.0),
    total_violations        INTEGER NOT NULL DEFAULT 0,
    critical_count          INTEGER NOT NULL DEFAULT 0,
    major_count             INTEGER NOT NULL DEFAULT 0,
    minor_count             INTEGER NOT NULL DEFAULT 0,
    execution_time_ms       INTEGER,
    summary                 JSONB DEFAULT '{}',
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_project ON compliance_reports(project_id);
CREATE INDEX idx_reports_status ON compliance_reports(status);
CREATE INDEX idx_reports_commit ON compliance_reports(commit_hash);
CREATE INDEX idx_reports_created ON compliance_reports(created_at DESC);
```

#### `violations`

```sql
CREATE TYPE violation_type AS ENUM (
    'forbidden_dependency',
    'missing_dependency',
    'layer_skip',
    'cycle',
    'naming_violation',
    'unauthorized_access'
);

CREATE TABLE violations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compliance_report_id    UUID NOT NULL REFERENCES compliance_reports(id) ON DELETE CASCADE,
    rule_id                 UUID REFERENCES architecture_rules(id),
    violation_type          violation_type NOT NULL,
    severity                severity_level NOT NULL,
    source_component        VARCHAR(255) NOT NULL,
    target_component        VARCHAR(255),
    source_file             VARCHAR(1024),
    source_line             INTEGER,
    description             TEXT NOT NULL,
    suggestion              TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_violations_report ON violations(compliance_report_id);
CREATE INDEX idx_violations_type ON violations(violation_type);
CREATE INDEX idx_violations_severity ON violations(severity);
```

#### `uploaded_documents`

```sql
CREATE TYPE doc_type AS ENUM ('text', 'diagram', 'pdf', 'markdown');
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE uploaded_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_name           VARCHAR(500) NOT NULL,
    file_type           doc_type NOT NULL,
    file_size_bytes     BIGINT NOT NULL,
    storage_path        VARCHAR(1024) NOT NULL,
    processing_status   processing_status NOT NULL DEFAULT 'pending',
    extracted_data      JSONB DEFAULT '{}',
    created_by          UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_project ON uploaded_documents(project_id);
```

#### `model_versions`

```sql
CREATE TABLE model_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name      VARCHAR(100) NOT NULL,
    version         VARCHAR(50) NOT NULL,
    description     TEXT,
    metrics         JSONB NOT NULL DEFAULT '{}',
    artifact_path   VARCHAR(1024) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,
    training_config JSONB DEFAULT '{}',
    trained_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(model_name, version)
);

-- Ensure only one active model per model_name
CREATE UNIQUE INDEX idx_model_active ON model_versions(model_name) WHERE is_active = TRUE;
```

#### `audit_logs`

```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       UUID,
    old_value       JSONB,
    new_value       JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- Partition by month for performance (optional)
-- CREATE TABLE audit_logs (...) PARTITION BY RANGE (created_at);
```

---

## 4. Neo4j Graph Schema

### 4.1 Node Labels & Properties

#### `:IntendedComponent`
Represents a component in the architect-defined (intended) architecture graph.

| Property | Type | Required | Description |
|---|---|---|---|
| `uid` | String (UUID) | Yes | Unique identifier |
| `name` | String | Yes | Component name (e.g., "UserService", "DatabaseLayer") |
| `component_type` | String | Yes | One of: `service`, `layer`, `module`, `database`, `ui`, `api`, `gateway`, `external`, `queue` |
| `layer_level` | Integer | No | Numeric layer position (0 = top/presentation, higher = lower/infrastructure) |
| `description` | String | No | Human-readable description |
| `architecture_version_id` | String (UUID) | Yes | FK to PostgreSQL `architecture_versions.id` |
| `project_id` | String (UUID) | Yes | FK to PostgreSQL `projects.id` |
| `created_at` | DateTime | Yes | ISO 8601 timestamp |

**Cypher — Create:**
```cypher
CREATE (c:IntendedComponent {
  uid: $uid,
  name: $name,
  component_type: $component_type,
  layer_level: $layer_level,
  description: $description,
  architecture_version_id: $arch_version_id,
  project_id: $project_id,
  created_at: datetime()
})
RETURN c
```

**Indexes:**
```cypher
CREATE INDEX intended_uid FOR (c:IntendedComponent) ON (c.uid);
CREATE INDEX intended_version FOR (c:IntendedComponent) ON (c.architecture_version_id);
CREATE INDEX intended_project FOR (c:IntendedComponent) ON (c.project_id);
```

---

#### `:ActualComponent`
Represents a component extracted from static code analysis (the "actual" implementation graph).

| Property | Type | Required | Description |
|---|---|---|---|
| `uid` | String (UUID) | Yes | Unique identifier |
| `name` | String | Yes | Fully qualified name (e.g., `app.services.user_service`) |
| `component_type` | String | Yes | One of: `module`, `class`, `package`, `file`, `function` |
| `file_path` | String | Yes | Relative file path in repository |
| `line_number` | Integer | No | Start line of definition |
| `project_id` | String (UUID) | Yes | FK to PostgreSQL `projects.id` |
| `commit_hash` | String | Yes | Git commit SHA this was extracted from |
| `analysis_id` | String (UUID) | Yes | Unique identifier for the analysis run |
| `created_at` | DateTime | Yes | ISO 8601 timestamp |

**Cypher — Create:**
```cypher
CREATE (c:ActualComponent {
  uid: $uid,
  name: $name,
  component_type: $component_type,
  file_path: $file_path,
  line_number: $line_number,
  project_id: $project_id,
  commit_hash: $commit_hash,
  analysis_id: $analysis_id,
  created_at: datetime()
})
RETURN c
```

**Indexes:**
```cypher
CREATE INDEX actual_uid FOR (c:ActualComponent) ON (c.uid);
CREATE INDEX actual_project FOR (c:ActualComponent) ON (c.project_id);
CREATE INDEX actual_commit FOR (c:ActualComponent) ON (c.commit_hash);
CREATE INDEX actual_analysis FOR (c:ActualComponent) ON (c.analysis_id);
```

---

### 4.2 Relationship Types & Properties

#### Intended Graph Relationships

| Relationship | Direction | Description | Properties |
|---|---|---|---|
| `[:ALLOWED_DEPENDENCY]` | `(A)-[:ALLOWED_DEPENDENCY]->(B)` | A is explicitly allowed to depend on B | `architecture_version_id`, `created_at` |
| `[:FORBIDDEN_DEPENDENCY]` | `(A)-[:FORBIDDEN_DEPENDENCY]->(B)` | A must NOT depend on B | `architecture_version_id`, `rule_id`, `severity`, `created_at` |
| `[:REQUIRES]` | `(A)-[:REQUIRES]->(B)` | A must depend on B (mandatory dependency) | `architecture_version_id`, `rule_id`, `created_at` |
| `[:LAYER_ABOVE]` | `(A)-[:LAYER_ABOVE]->(B)` | A is architecturally above B (A can call B, B cannot call A) | `architecture_version_id`, `created_at` |

**Cypher — Create Allowed Dependency:**
```cypher
MATCH (a:IntendedComponent {uid: $source_uid})
MATCH (b:IntendedComponent {uid: $target_uid})
CREATE (a)-[:ALLOWED_DEPENDENCY {
  architecture_version_id: $arch_version_id,
  created_at: datetime()
}]->(b)
```

**Cypher — Create Forbidden Dependency:**
```cypher
MATCH (a:IntendedComponent {uid: $source_uid})
MATCH (b:IntendedComponent {uid: $target_uid})
CREATE (a)-[:FORBIDDEN_DEPENDENCY {
  architecture_version_id: $arch_version_id,
  rule_id: $rule_id,
  severity: $severity,
  created_at: datetime()
}]->(b)
```

**Cypher — Create Layer Relationship:**
```cypher
MATCH (a:IntendedComponent {uid: $upper_uid})
MATCH (b:IntendedComponent {uid: $lower_uid})
CREATE (a)-[:LAYER_ABOVE {
  architecture_version_id: $arch_version_id,
  created_at: datetime()
}]->(b)
```

---

#### Actual Graph Relationships

| Relationship | Direction | Description | Properties |
|---|---|---|---|
| `[:DEPENDS_ON]` | `(A)-[:DEPENDS_ON]->(B)` | A imports/uses B | `import_statement`, `file_path`, `line_number`, `commit_hash`, `analysis_id` |
| `[:EXTENDS]` | `(A)-[:EXTENDS]->(B)` | A inherits from B | `file_path`, `line_number`, `commit_hash` |
| `[:IMPLEMENTS]` | `(A)-[:IMPLEMENTS]->(B)` | A implements interface B | `file_path`, `line_number`, `commit_hash` |

**Cypher — Create Dependency:**
```cypher
MATCH (a:ActualComponent {uid: $source_uid})
MATCH (b:ActualComponent {uid: $target_uid})
CREATE (a)-[:DEPENDS_ON {
  import_statement: $import_stmt,
  file_path: $file_path,
  line_number: $line_number,
  commit_hash: $commit_hash,
  analysis_id: $analysis_id
}]->(b)
```

---

#### Cross-Graph Relationships (Mapping)

| Relationship | Direction | Description | Properties |
|---|---|---|---|
| `[:MAPS_TO]` | `(Intended)-[:MAPS_TO]->(Actual)` | Links intended component to its code implementation | `mapping_type` ("manual" / "auto"), `confidence`, `created_at` |

**Cypher — Create Mapping:**
```cypher
MATCH (i:IntendedComponent {uid: $intended_uid})
MATCH (a:ActualComponent {uid: $actual_uid})
CREATE (i)-[:MAPS_TO {
  mapping_type: $mapping_type,
  confidence: $confidence,
  created_at: datetime()
}]->(a)
```

---

### 4.3 Common Query Patterns (Cypher)

#### Get full intended architecture graph for a version:
```cypher
MATCH (c:IntendedComponent {architecture_version_id: $version_id})
OPTIONAL MATCH (c)-[r]->(c2:IntendedComponent {architecture_version_id: $version_id})
RETURN c, r, c2
```

#### Get actual dependency graph for a commit:
```cypher
MATCH (c:ActualComponent {project_id: $project_id, commit_hash: $commit_hash})
OPTIONAL MATCH (c)-[r:DEPENDS_ON]->(c2:ActualComponent {commit_hash: $commit_hash})
RETURN c, r, c2
```

#### Detect forbidden dependency violations:
```cypher
// Find actual dependencies that match forbidden patterns
MATCH (fi:IntendedComponent)-[:FORBIDDEN_DEPENDENCY {architecture_version_id: $version_id}]->(ti:IntendedComponent)
MATCH (fi)-[:MAPS_TO]->(fa:ActualComponent {commit_hash: $commit_hash})
MATCH (ti)-[:MAPS_TO]->(ta:ActualComponent {commit_hash: $commit_hash})
MATCH (fa)-[dep:DEPENDS_ON]->(ta)
RETURN fi.name AS forbidden_source,
       ti.name AS forbidden_target,
       fa.name AS actual_source,
       ta.name AS actual_target,
       dep.file_path AS violation_file,
       dep.line_number AS violation_line
```

#### Detect cycles in actual dependency graph:
```cypher
MATCH path = (c:ActualComponent {project_id: $project_id, commit_hash: $commit_hash})
             -[:DEPENDS_ON*2..10]->(c)
RETURN [node IN nodes(path) | node.name] AS cycle_components,
       length(path) AS cycle_length
LIMIT 50
```

#### Detect layer skipping violations:
```cypher
// Find cases where a component skips intermediate layers
MATCH (upper:IntendedComponent)-[:LAYER_ABOVE*2..]->(lower:IntendedComponent)
WHERE upper.architecture_version_id = $version_id
  AND lower.architecture_version_id = $version_id
  AND NOT EXISTS {
    MATCH (upper)-[:LAYER_ABOVE]->(lower)
  }
MATCH (upper)-[:MAPS_TO]->(au:ActualComponent {commit_hash: $commit_hash})
MATCH (lower)-[:MAPS_TO]->(al:ActualComponent {commit_hash: $commit_hash})
MATCH (au)-[dep:DEPENDS_ON]->(al)
RETURN upper.name AS upper_layer,
       lower.name AS lower_layer,
       au.name AS actual_source,
       al.name AS actual_target,
       dep.file_path AS file,
       dep.line_number AS line
```

#### Detect missing required dependencies:
```cypher
MATCH (ri:IntendedComponent)-[:REQUIRES {architecture_version_id: $version_id}]->(ti:IntendedComponent)
MATCH (ri)-[:MAPS_TO]->(ra:ActualComponent {commit_hash: $commit_hash})
MATCH (ti)-[:MAPS_TO]->(ta:ActualComponent {commit_hash: $commit_hash})
WHERE NOT EXISTS {
  MATCH (ra)-[:DEPENDS_ON]->(ta)
}
RETURN ri.name AS source_missing_dependency,
       ti.name AS required_target,
       ra.name AS actual_source,
       ta.name AS actual_target
```

#### Calculate compliance statistics:
```cypher
MATCH (c:ActualComponent {project_id: $project_id, commit_hash: $commit_hash})
OPTIONAL MATCH (c)-[d:DEPENDS_ON]->(c2:ActualComponent)
WITH count(DISTINCT c) AS total_components, count(d) AS total_dependencies
RETURN total_components, total_dependencies
```

#### Clean up old analysis data:
```cypher
MATCH (c:ActualComponent {analysis_id: $old_analysis_id})
DETACH DELETE c
```

---

## 5. REST API Endpoints

> **Auth Header (all protected routes):** `Authorization: Bearer <access_token>`  
> **CI/CD Auth Header:** `X-API-Key: <ci_cd_token>` + `X-Project-ID: <project_uuid>`  
> **Content-Type:** `application/json` (unless multipart upload)

---

### 5.1 Authentication

#### `POST /auth/register`

Create a new user account.

**Request:**
```json
{
  "email": "architect@company.com",
  "password": "SecureP@ss123",
  "full_name": "Jane Smith",
  "organization_name": "Acme Corp"
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "architect@company.com",
      "full_name": "Jane Smith",
      "role": "admin",
      "organization": {
        "id": "org-uuid",
        "name": "Acme Corp",
        "slug": "acme-corp"
      }
    },
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2g...",
    "token_type": "bearer",
    "expires_in": 1800
  }
}
```

**Errors:** `409 CONFLICT` (email exists), `400 VALIDATION_ERROR`

---

#### `POST /auth/login`

Authenticate and receive tokens.

**Request:**
```json
{
  "email": "architect@company.com",
  "password": "SecureP@ss123"
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "architect@company.com",
      "full_name": "Jane Smith",
      "role": "architect",
      "organization_id": "org-uuid"
    },
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2g...",
    "token_type": "bearer",
    "expires_in": 1800
  }
}
```

**Errors:** `401 UNAUTHORIZED` (invalid credentials)

---

#### `POST /auth/refresh`

Rotate tokens using refresh token.

**Request:**
```json
{
  "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2g..."
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...(new)",
    "refresh_token": "bmV3IHJlZnJlc2ggdG9rZW4...(rotated)",
    "token_type": "bearer",
    "expires_in": 1800
  }
}
```

**Errors:** `401 UNAUTHORIZED` (token revoked/expired)

---

#### `POST /auth/logout`

Revoke current refresh token.

**Request:**
```json
{
  "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2g..."
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": { "message": "Successfully logged out" }
}
```

---

#### `GET /auth/me`

Get current authenticated user profile. **Requires:** Bearer token.

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "id": "user-uuid",
    "email": "architect@company.com",
    "full_name": "Jane Smith",
    "role": "architect",
    "organization": {
      "id": "org-uuid",
      "name": "Acme Corp",
      "slug": "acme-corp"
    },
    "created_at": "2026-01-15T08:00:00Z"
  }
}
```

---

### 5.2 Organizations

#### `GET /organizations/{org_id}`

**Roles:** any authenticated member

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "id": "org-uuid",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "description": "Software consulting firm",
    "member_count": 12,
    "project_count": 5,
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

#### `PUT /organizations/{org_id}`

**Roles:** `admin`

**Request:**
```json
{
  "name": "Acme Corporation",
  "description": "Updated description"
}
```

#### `GET /organizations/{org_id}/members`

**Roles:** `admin`, `architect`  
**Query Params:** `?page=1&per_page=20&role=developer`

**Response (200):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "user-uuid",
      "email": "dev@company.com",
      "full_name": "John Doe",
      "role": "developer",
      "is_active": true,
      "created_at": "2026-02-01T00:00:00Z"
    }
  ],
  "pagination": { "page": 1, "per_page": 20, "total_items": 12, "total_pages": 1 }
}
```

#### `POST /organizations/{org_id}/members/invite`

**Roles:** `admin`

**Request:**
```json
{
  "email": "newdev@company.com",
  "full_name": "New Developer",
  "role": "developer"
}
```

---

### 5.3 Projects

#### `POST /projects`

**Roles:** `admin`, `architect`

**Request:**
```json
{
  "name": "Payment Service",
  "description": "Handles payment processing and billing",
  "repository_url": "https://github.com/acme/payment-service",
  "default_branch": "main",
  "language": "python"
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "id": "project-uuid",
    "name": "Payment Service",
    "description": "Handles payment processing and billing",
    "repository_url": "https://github.com/acme/payment-service",
    "default_branch": "main",
    "language": "python",
    "organization_id": "org-uuid",
    "created_by": "user-uuid",
    "is_active": true,
    "created_at": "2026-03-04T10:00:00Z"
  }
}
```

#### `GET /projects`

**Roles:** any authenticated  
**Query Params:** `?page=1&per_page=20&search=payment&is_active=true`

**Response (200):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "project-uuid",
      "name": "Payment Service",
      "description": "Handles payment processing",
      "language": "python",
      "is_active": true,
      "latest_health_score": 87.5,
      "last_compliance_check": "2026-03-04T09:30:00Z",
      "active_architecture_version": 3,
      "created_at": "2026-02-01T00:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

#### `GET /projects/{project_id}`

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "id": "project-uuid",
    "name": "Payment Service",
    "description": "Handles payment processing and billing",
    "repository_url": "https://github.com/acme/payment-service",
    "default_branch": "main",
    "language": "python",
    "organization_id": "org-uuid",
    "created_by": {
      "id": "user-uuid",
      "full_name": "Jane Smith"
    },
    "is_active": true,
    "stats": {
      "architecture_versions": 3,
      "active_rules": 15,
      "total_compliance_checks": 42,
      "latest_health_score": 87.5,
      "active_pipelines": 2
    },
    "created_at": "2026-02-01T00:00:00Z",
    "updated_at": "2026-03-04T10:00:00Z"
  }
}
```

#### `PUT /projects/{project_id}`

**Roles:** `admin`, `architect`

**Request:**
```json
{
  "name": "Payment Service v2",
  "description": "Updated description",
  "repository_url": "https://github.com/acme/payment-service-v2",
  "default_branch": "develop"
}
```

#### `DELETE /projects/{project_id}`

**Roles:** `admin`  
**Response (200):** Soft-deletes the project (sets `is_active = false`).

---

### 5.4 Architecture Versions

#### `POST /projects/{project_id}/architecture`

Create a new architecture version (auto-increments version number).

**Roles:** `architect`, `admin`

**Request:**
```json
{
  "description": "Microservices architecture with event-driven communication"
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "id": "version-uuid",
    "project_id": "project-uuid",
    "version_number": 4,
    "status": "draft",
    "description": "Microservices architecture with event-driven communication",
    "created_by": "user-uuid",
    "created_at": "2026-03-04T10:00:00Z"
  }
}
```

#### `GET /projects/{project_id}/architecture`

List all versions for a project.  
**Query Params:** `?status=active&page=1&per_page=20`

**Response (200):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "version-uuid",
      "version_number": 3,
      "status": "active",
      "description": "Layered architecture",
      "component_count": 8,
      "rule_count": 15,
      "created_by": { "id": "user-uuid", "full_name": "Jane Smith" },
      "activated_at": "2026-02-15T00:00:00Z",
      "created_at": "2026-02-10T00:00:00Z"
    }
  ]
}
```

#### `GET /projects/{project_id}/architecture/{version_id}`

Get detailed architecture version with component and rule summaries.

#### `PATCH /projects/{project_id}/architecture/{version_id}/status`

Transition architecture version status.

**Roles:** `architect`, `admin`

**Request:**
```json
{
  "status": "active"
}
```

**Valid Transitions:**
```
draft → under_review → approved → active → deprecated
                     ↘ draft (rejected, back to draft)
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "id": "version-uuid",
    "version_number": 4,
    "status": "active",
    "activated_at": "2026-03-04T10:30:00Z",
    "previous_status": "approved"
  }
}
```

**Errors:** `422 UNPROCESSABLE_ENTITY` (invalid transition, e.g., `draft → active`)

**Side Effect:** When a version is activated, any previously active version for the same project is automatically set to `deprecated`.

---

### 5.5 Architecture Rules

#### `POST /architecture/{version_id}/rules`

Create a rule manually.

**Roles:** `architect`, `admin`

**Request:**
```json
{
  "rule_text": "The UI layer must not directly access the database layer",
  "rule_type": "forbidden_dependency",
  "source_component": "UILayer",
  "target_component": "DatabaseLayer",
  "severity": "critical"
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "id": "rule-uuid",
    "architecture_version_id": "version-uuid",
    "rule_text": "The UI layer must not directly access the database layer",
    "rule_type": "forbidden_dependency",
    "source_component": "UILayer",
    "target_component": "DatabaseLayer",
    "severity": "critical",
    "is_ai_generated": false,
    "confidence_score": null,
    "is_active": true,
    "created_by": "user-uuid",
    "created_at": "2026-03-04T10:00:00Z"
  }
}
```

#### `POST /architecture/{version_id}/rules/batch`

Create multiple rules at once (used after AI extraction).

**Request:**
```json
{
  "rules": [
    {
      "rule_text": "Services must not call the database directly",
      "rule_type": "forbidden_dependency",
      "source_component": "ServiceLayer",
      "target_component": "Database",
      "severity": "critical",
      "is_ai_generated": true,
      "confidence_score": 0.92
    },
    {
      "rule_text": "Controllers must depend on services",
      "rule_type": "required_dependency",
      "source_component": "ControllerLayer",
      "target_component": "ServiceLayer",
      "severity": "major",
      "is_ai_generated": true,
      "confidence_score": 0.88
    }
  ]
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "created_count": 2,
    "rules": [ ... ]
  }
}
```

#### `GET /architecture/{version_id}/rules`

**Query Params:** `?rule_type=forbidden_dependency&severity=critical&is_active=true&page=1&per_page=50`

#### `GET /architecture/{version_id}/rules/{rule_id}`

#### `PUT /architecture/{version_id}/rules/{rule_id}`

Update rule text, severity, or active status.

#### `DELETE /architecture/{version_id}/rules/{rule_id}`

Soft-delete (sets `is_active = false`).

---

### 5.6 Architecture Graph (Neo4j)

#### `POST /architecture/{version_id}/components`

Add a component to the intended architecture graph.

**Request:**
```json
{
  "name": "UserService",
  "component_type": "service",
  "layer_level": 1,
  "description": "Handles user registration and authentication"
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "uid": "component-uuid",
    "name": "UserService",
    "component_type": "service",
    "layer_level": 1,
    "description": "Handles user registration and authentication",
    "architecture_version_id": "version-uuid",
    "project_id": "project-uuid",
    "created_at": "2026-03-04T10:00:00Z"
  }
}
```

#### `POST /architecture/{version_id}/components/batch`

Add multiple components at once.

**Request:**
```json
{
  "components": [
    { "name": "UILayer", "component_type": "layer", "layer_level": 0 },
    { "name": "ServiceLayer", "component_type": "layer", "layer_level": 1 },
    { "name": "RepositoryLayer", "component_type": "layer", "layer_level": 2 },
    { "name": "DatabaseLayer", "component_type": "layer", "layer_level": 3 }
  ]
}
```

#### `GET /architecture/{version_id}/graph`

Get the complete intended architecture graph (nodes + relationships).

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "components": [
      {
        "uid": "comp-1-uuid",
        "name": "UILayer",
        "component_type": "layer",
        "layer_level": 0
      },
      {
        "uid": "comp-2-uuid",
        "name": "ServiceLayer",
        "component_type": "layer",
        "layer_level": 1
      }
    ],
    "relationships": [
      {
        "id": "rel-uuid",
        "source_uid": "comp-1-uuid",
        "target_uid": "comp-2-uuid",
        "type": "ALLOWED_DEPENDENCY",
        "properties": {}
      },
      {
        "id": "rel-uuid-2",
        "source_uid": "comp-1-uuid",
        "target_uid": "comp-3-uuid",
        "type": "FORBIDDEN_DEPENDENCY",
        "properties": { "rule_id": "rule-uuid", "severity": "critical" }
      }
    ],
    "stats": {
      "total_components": 4,
      "total_relationships": 6
    }
  }
}
```

#### `POST /architecture/{version_id}/relationships`

Create a relationship between components.

**Request:**
```json
{
  "source_uid": "comp-1-uuid",
  "target_uid": "comp-2-uuid",
  "type": "ALLOWED_DEPENDENCY"
}
```

#### `POST /architecture/{version_id}/relationships/batch`

Create multiple relationships.

**Request:**
```json
{
  "relationships": [
    { "source_uid": "comp-1-uuid", "target_uid": "comp-2-uuid", "type": "ALLOWED_DEPENDENCY" },
    { "source_uid": "comp-1-uuid", "target_uid": "comp-4-uuid", "type": "FORBIDDEN_DEPENDENCY", "rule_id": "rule-uuid" },
    { "source_uid": "comp-1-uuid", "target_uid": "comp-2-uuid", "type": "LAYER_ABOVE" }
  ]
}
```

#### `DELETE /architecture/{version_id}/components/{component_uid}`

Removes the component node and all its relationships from Neo4j.

#### `DELETE /architecture/{version_id}/relationships/{relationship_id}`

#### `POST /architecture/{version_id}/mappings`

Map intended components to actual code components.

**Request:**
```json
{
  "mappings": [
    {
      "intended_uid": "comp-1-uuid",
      "actual_uid": "actual-comp-uuid",
      "mapping_type": "manual"
    }
  ]
}
```

---

### 5.7 Static Code Analysis

#### `POST /projects/{project_id}/analyze`

Trigger a static analysis of the project's source code.

**Roles:** `architect`, `developer`, `admin`, or CI/CD token

**Request:**
```json
{
  "commit_hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "branch": "main",
  "repository_url": "https://github.com/acme/payment-service",
  "analysis_scope": "full",
  "options": {
    "include_patterns": ["**/*.py"],
    "exclude_patterns": ["**/tests/**", "**/migrations/**"],
    "max_depth": 10
  }
}
```

**Response (202 Accepted):**
```json
{
  "status": "success",
  "data": {
    "analysis_id": "analysis-uuid",
    "project_id": "project-uuid",
    "status": "pending",
    "commit_hash": "a1b2c3d4...",
    "branch": "main",
    "queued_at": "2026-03-04T10:00:00Z",
    "estimated_duration_seconds": 120
  }
}
```

#### `GET /projects/{project_id}/analysis/{analysis_id}`

Poll analysis status.

**Response (200) — Running:**
```json
{
  "status": "success",
  "data": {
    "analysis_id": "analysis-uuid",
    "status": "running",
    "progress": {
      "files_scanned": 45,
      "total_files": 120,
      "percentage": 37.5
    },
    "started_at": "2026-03-04T10:00:05Z"
  }
}
```

**Response (200) — Completed:**
```json
{
  "status": "success",
  "data": {
    "analysis_id": "analysis-uuid",
    "status": "completed",
    "commit_hash": "a1b2c3d4...",
    "results": {
      "total_files_scanned": 120,
      "total_modules": 35,
      "total_classes": 78,
      "total_dependencies": 156,
      "cycles_detected": 2,
      "execution_time_ms": 4500
    },
    "started_at": "2026-03-04T10:00:05Z",
    "completed_at": "2026-03-04T10:00:10Z"
  }
}
```

#### `GET /projects/{project_id}/dependency-graph`

Get the actual code dependency graph from Neo4j.

**Query Params:** `?commit_hash=a1b2c3d4&depth=3&component_type=module`

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "commit_hash": "a1b2c3d4...",
    "components": [
      {
        "uid": "actual-uuid-1",
        "name": "app.services.user_service",
        "component_type": "module",
        "file_path": "app/services/user_service.py"
      },
      {
        "uid": "actual-uuid-2",
        "name": "app.repositories.user_repo",
        "component_type": "module",
        "file_path": "app/repositories/user_repo.py"
      }
    ],
    "dependencies": [
      {
        "source_uid": "actual-uuid-1",
        "target_uid": "actual-uuid-2",
        "import_statement": "from app.repositories.user_repo import UserRepository",
        "file_path": "app/services/user_service.py",
        "line_number": 3
      }
    ],
    "cycles": [
      {
        "components": ["app.services.a", "app.services.b", "app.services.a"],
        "length": 2
      }
    ],
    "stats": {
      "total_components": 35,
      "total_dependencies": 156,
      "total_cycles": 2
    }
  }
}
```

---

### 5.8 Compliance Engine

#### `POST /projects/{project_id}/compliance/check`

Trigger a compliance check (compare intended vs actual).

**Roles:** `architect`, `developer`, `admin`, or CI/CD token

**Request:**
```json
{
  "commit_hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "branch": "main",
  "architecture_version_id": "version-uuid",
  "trigger": "manual",
  "options": {
    "fail_on_critical": true,
    "fail_on_major": false,
    "skip_cycle_detection": false,
    "auto_analyze": true
  }
}
```

- **`auto_analyze: true`** — triggers static analysis first if no analysis exists for this commit, then runs compliance.

**Response (202 Accepted):**
```json
{
  "status": "success",
  "data": {
    "report_id": "report-uuid",
    "project_id": "project-uuid",
    "status": "pending",
    "commit_hash": "a1b2c3d4...",
    "queued_at": "2026-03-04T10:00:00Z"
  }
}
```

#### `GET /projects/{project_id}/compliance/reports`

List compliance reports.  
**Query Params:** `?status=failed&branch=main&page=1&per_page=20&sort=-created_at`

**Response (200):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "report-uuid",
      "commit_hash": "a1b2c3d4...",
      "branch": "main",
      "trigger": "ci_cd",
      "status": "failed",
      "health_score": 72.5,
      "total_violations": 8,
      "critical_count": 2,
      "major_count": 3,
      "minor_count": 3,
      "execution_time_ms": 3200,
      "created_at": "2026-03-04T10:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

#### `GET /projects/{project_id}/compliance/reports/{report_id}`

Get detailed compliance report.

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "id": "report-uuid",
    "project_id": "project-uuid",
    "architecture_version_id": "version-uuid",
    "commit_hash": "a1b2c3d4e5f6...",
    "branch": "main",
    "trigger": "ci_cd",
    "status": "failed",
    "health_score": 72.5,
    "scoring_breakdown": {
      "base_score": 100,
      "critical_penalty": -20,
      "major_penalty": -15,
      "minor_penalty": -3,
      "final_score": 72.5
    },
    "violation_summary": {
      "total": 8,
      "by_severity": { "critical": 2, "major": 3, "minor": 3 },
      "by_type": {
        "forbidden_dependency": 3,
        "layer_skip": 2,
        "cycle": 1,
        "missing_dependency": 2
      }
    },
    "execution_time_ms": 3200,
    "started_at": "2026-03-04T10:00:01Z",
    "completed_at": "2026-03-04T10:00:04Z",
    "created_at": "2026-03-04T10:00:00Z"
  }
}
```

#### `GET /projects/{project_id}/compliance/reports/{report_id}/violations`

Get violations for a specific report.  
**Query Params:** `?severity=critical&violation_type=forbidden_dependency&page=1&per_page=50`

**Response (200):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "violation-uuid",
      "rule_id": "rule-uuid",
      "violation_type": "forbidden_dependency",
      "severity": "critical",
      "source_component": "UILayer",
      "target_component": "DatabaseLayer",
      "source_file": "app/views/dashboard.py",
      "source_line": 15,
      "description": "Direct database access from UI layer violates forbidden dependency rule",
      "suggestion": "Use the ServiceLayer as an intermediary. Import from app.services instead of app.db",
      "rule": {
        "id": "rule-uuid",
        "rule_text": "The UI layer must not directly access the database layer",
        "severity": "critical"
      },
      "created_at": "2026-03-04T10:00:03Z"
    }
  ],
  "pagination": { ... }
}
```

#### `GET /projects/{project_id}/compliance/score`

Get the latest health score and trend.

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "current_score": 72.5,
    "previous_score": 85.0,
    "trend": "declining",
    "delta": -12.5,
    "last_check": "2026-03-04T10:00:00Z",
    "history": [
      { "date": "2026-03-01", "score": 90.0 },
      { "date": "2026-03-02", "score": 85.0 },
      { "date": "2026-03-03", "score": 80.0 },
      { "date": "2026-03-04", "score": 72.5 }
    ]
  }
}
```

---

### 5.9 AI Intelligence Services

#### `POST /ai/rules/extract`

Extract structured rules from natural language text using the NLP Rule Classification model.

**Request:**
```json
{
  "text": "The presentation layer should never directly access the data access layer. All services must communicate through the API gateway. The authentication module is required by every service.",
  "architecture_version_id": "version-uuid",
  "auto_create_rules": false
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "extracted_rules": [
      {
        "rule_text": "The presentation layer should never directly access the data access layer",
        "rule_type": "forbidden_dependency",
        "source_component": "PresentationLayer",
        "target_component": "DataAccessLayer",
        "severity": "critical",
        "confidence": 0.94,
        "model_version": "rule_classifier_v1.2"
      },
      {
        "rule_text": "All services must communicate through the API gateway",
        "rule_type": "required_dependency",
        "source_component": "Services",
        "target_component": "APIGateway",
        "severity": "major",
        "confidence": 0.87,
        "model_version": "rule_classifier_v1.2"
      },
      {
        "rule_text": "The authentication module is required by every service",
        "rule_type": "required_dependency",
        "source_component": "Services",
        "target_component": "AuthenticationModule",
        "severity": "major",
        "confidence": 0.91,
        "model_version": "rule_classifier_v1.2"
      }
    ],
    "processing_time_ms": 250,
    "model_info": {
      "name": "rule_classifier",
      "version": "v1.2",
      "f1_score": 0.89
    }
  }
}
```

#### `POST /ai/rules/extract` with `auto_create_rules: true`

Same as above but automatically creates the rules in `architecture_rules` (with `is_ai_generated = true`). Returns the created rule IDs in addition.

---

#### `POST /ai/ner/extract`

Extract architecture components and relationships from text using the NER model.

**Request:**
```json
{
  "text": "The user service communicates with the payment gateway through a REST API. The order service depends on the inventory database for stock validation.",
  "architecture_version_id": "version-uuid"
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "entities": [
      { "text": "user service", "label": "COMPONENT", "start": 4, "end": 16, "confidence": 0.95 },
      { "text": "payment gateway", "label": "COMPONENT", "start": 37, "end": 52, "confidence": 0.93 },
      { "text": "REST API", "label": "INTERFACE", "start": 63, "end": 71, "confidence": 0.88 },
      { "text": "order service", "label": "COMPONENT", "start": 77, "end": 90, "confidence": 0.96 },
      { "text": "inventory database", "label": "COMPONENT", "start": 106, "end": 124, "confidence": 0.91 },
      { "text": "stock validation", "label": "FUNCTION", "start": 129, "end": 145, "confidence": 0.72 }
    ],
    "relationships": [
      {
        "source": "user service",
        "target": "payment gateway",
        "relation": "communicates_with",
        "confidence": 0.90
      },
      {
        "source": "order service",
        "target": "inventory database",
        "relation": "depends_on",
        "confidence": 0.92
      }
    ],
    "processing_time_ms": 180,
    "model_info": {
      "name": "component_ner",
      "version": "v1.0",
      "f1_score": 0.85
    }
  }
}
```

---

#### `POST /ai/diagram/analyze`

Process an architecture diagram image and extract components + relationships.

**Content-Type:** `multipart/form-data`

**Request Fields:**
| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File (image) | Yes | PNG, JPG, or SVG diagram |
| `project_id` | String | Yes | Project UUID |
| `architecture_version_id` | String | No | Architecture version to associate |

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "diagram_id": "diagram-uuid",
    "detected_components": [
      {
        "label": "User Service",
        "component_type": "service",
        "bounding_box": { "x": 100, "y": 50, "width": 150, "height": 60 },
        "confidence": 0.92
      },
      {
        "label": "PostgreSQL",
        "component_type": "database",
        "bounding_box": { "x": 400, "y": 300, "width": 120, "height": 80 },
        "confidence": 0.88
      }
    ],
    "detected_relationships": [
      {
        "source": "User Service",
        "target": "PostgreSQL",
        "relation_type": "dependency",
        "confidence": 0.85
      }
    ],
    "ocr_texts": [
      { "text": "User Service", "position": { "x": 120, "y": 70 } },
      { "text": "PostgreSQL", "position": { "x": 420, "y": 330 } }
    ],
    "processing_time_ms": 2500,
    "model_info": {
      "detector": { "name": "diagram_detector", "version": "v1.0" },
      "ocr": { "name": "easyocr", "version": "1.7" }
    }
  }
}
```

---

#### `POST /ai/embeddings/text`

Generate embeddings for architecture text.

**Request:**
```json
{
  "texts": [
    "The service layer handles business logic",
    "Database layer provides persistence"
  ],
  "model": "sentence-bert"
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "embeddings": [
      { "text": "The service layer handles business logic", "vector": [0.023, -0.156, ...], "dimensions": 768 },
      { "text": "Database layer provides persistence", "vector": [-0.089, 0.234, ...], "dimensions": 768 }
    ],
    "model": "sentence-bert",
    "processing_time_ms": 45
  }
}
```

---

#### `POST /ai/embeddings/image`

Generate embeddings for architecture diagram images.

**Content-Type:** `multipart/form-data`

**Request Fields:**
| Field | Type | Required |
|---|---|---|
| `file` | File (image) | Yes |
| `model` | String | No (default: `resnet50`) |

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "embedding": {
      "vector": [0.045, -0.112, ...],
      "dimensions": 2048
    },
    "model": "resnet50",
    "processing_time_ms": 320
  }
}
```

---

#### `POST /ai/align`

Multimodal alignment — align text and image embeddings into shared space.

**Content-Type:** `multipart/form-data`

**Request Fields:**
| Field | Type | Required | Description |
|---|---|---|---|
| `text` | String | Yes | Architecture text description |
| `file` | File (image) | Yes | Corresponding architecture diagram |
| `project_id` | String | Yes | Project UUID |

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "text_embedding": [0.023, -0.156, ...],
    "image_embedding": [-0.089, 0.234, ...],
    "aligned_embedding": [0.012, -0.078, ...],
    "similarity_score": 0.87,
    "dimensions": 512,
    "model_info": {
      "name": "multimodal_aligner",
      "version": "v0.1"
    },
    "processing_time_ms": 850
  }
}
```

---

#### `POST /ai/search/semantic`

Semantic search across architecture components and rules.

**Request:**
```json
{
  "query": "which component handles user authentication?",
  "project_id": "project-uuid",
  "search_scope": ["components", "rules", "documents"],
  "top_k": 5
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "type": "component",
        "name": "AuthenticationService",
        "description": "Handles user login, registration, and token management",
        "similarity_score": 0.94,
        "source": "architecture_v3"
      },
      {
        "type": "rule",
        "rule_text": "All external requests must pass through the authentication module",
        "similarity_score": 0.82,
        "source": "architecture_v3"
      }
    ],
    "processing_time_ms": 65
  }
}
```

---

### 5.10 CI/CD Pipelines & Webhooks

#### `POST /projects/{project_id}/pipelines`

Register a CI/CD pipeline.

**Roles:** `admin`, `devops`

**Request:**
```json
{
  "name": "GitHub Actions - Main Branch",
  "provider": "github_actions",
  "config": {
    "trigger_on": ["push", "pull_request"],
    "branches": ["main", "develop"],
    "fail_on_critical": true,
    "fail_on_major": false
  }
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "id": "pipeline-uuid",
    "name": "GitHub Actions - Main Branch",
    "provider": "github_actions",
    "webhook_url": "https://api.archguard.dev/api/v1/webhooks/github",
    "webhook_secret": "whsec_a1b2c3d4e5f6...",
    "config": { ... },
    "is_active": true,
    "created_at": "2026-03-04T10:00:00Z"
  }
}
```

#### `GET /projects/{project_id}/pipelines`

List pipelines for a project.

#### `PUT /projects/{project_id}/pipelines/{pipeline_id}`

Update pipeline config.

#### `DELETE /projects/{project_id}/pipelines/{pipeline_id}`

Deactivate pipeline.

---

#### `POST /projects/{project_id}/pipelines/tokens`

Generate a CI/CD API token.

**Roles:** `admin`, `devops`

**Request:**
```json
{
  "name": "GitHub Actions Token",
  "permissions": ["compliance:trigger", "analysis:trigger", "reports:read"],
  "expires_at": "2027-03-04T00:00:00Z"
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "id": "token-uuid",
    "name": "GitHub Actions Token",
    "token": "agp_live_a1b2c3d4e5f6g7h8i9j0...",
    "permissions": ["compliance:trigger", "analysis:trigger", "reports:read"],
    "expires_at": "2027-03-04T00:00:00Z",
    "created_at": "2026-03-04T10:00:00Z"
  }
}
```

> **Note:** The full token is only returned once at creation. Store it securely.

---

### 5.11 Document Management

#### `POST /projects/{project_id}/documents/upload`

Upload architecture documents or diagrams.

**Content-Type:** `multipart/form-data`

**Request Fields:**
| Field | Type | Required |
|---|---|---|
| `file` | File | Yes |
| `file_type` | String (`text`, `diagram`, `pdf`, `markdown`) | Yes |
| `description` | String | No |

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "id": "doc-uuid",
    "file_name": "architecture-v3.png",
    "file_type": "diagram",
    "file_size_bytes": 245000,
    "processing_status": "pending",
    "created_at": "2026-03-04T10:00:00Z"
  }
}
```

#### `GET /projects/{project_id}/documents`

**Query Params:** `?file_type=diagram&processing_status=completed`

#### `GET /projects/{project_id}/documents/{doc_id}`

Get document metadata + extracted data (if processing is complete).

#### `DELETE /projects/{project_id}/documents/{doc_id}`

---

### 5.12 Dashboard & Analytics

#### `GET /dashboard/overview`

Organization-level dashboard overview.

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "organization": {
      "id": "org-uuid",
      "name": "Acme Corp"
    },
    "summary": {
      "total_projects": 5,
      "active_projects": 4,
      "total_compliance_checks_30d": 142,
      "average_health_score": 84.2,
      "total_violations_30d": 56,
      "critical_violations_30d": 8
    },
    "projects_at_risk": [
      {
        "id": "project-uuid",
        "name": "Payment Service",
        "health_score": 45.0,
        "critical_violations": 5,
        "last_check": "2026-03-04T10:00:00Z"
      }
    ],
    "recent_activity": [
      {
        "type": "compliance_check",
        "project": "Payment Service",
        "status": "failed",
        "health_score": 45.0,
        "timestamp": "2026-03-04T10:00:00Z"
      }
    ],
    "health_trend_30d": [
      { "date": "2026-02-04", "average_score": 90.0 },
      { "date": "2026-02-11", "average_score": 88.5 },
      { "date": "2026-02-18", "average_score": 86.0 },
      { "date": "2026-02-25", "average_score": 85.0 },
      { "date": "2026-03-04", "average_score": 84.2 }
    ]
  }
}
```

#### `GET /dashboard/projects/{project_id}/trends`

**Query Params:** `?period=30d` (7d, 30d, 90d, 1y)

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "project_id": "project-uuid",
    "project_name": "Payment Service",
    "period": "30d",
    "health_score_trend": [
      { "date": "2026-02-04", "score": 92.0, "violations": 3 },
      { "date": "2026-02-11", "score": 88.0, "violations": 5 },
      { "date": "2026-02-18", "score": 85.0, "violations": 6 },
      { "date": "2026-02-25", "score": 80.0, "violations": 7 },
      { "date": "2026-03-04", "score": 72.5, "violations": 8 }
    ],
    "violation_trend": {
      "forbidden_dependency": [1, 2, 3, 3, 3],
      "layer_skip": [0, 1, 1, 2, 2],
      "cycle": [1, 1, 1, 1, 1],
      "missing_dependency": [1, 1, 1, 1, 2]
    },
    "compliance_check_frequency": {
      "total_checks": 25,
      "pass_rate": 0.40,
      "average_execution_time_ms": 3500
    }
  }
}
```

#### `GET /dashboard/projects/{project_id}/violations/distribution`

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "by_severity": {
      "critical": 5,
      "major": 12,
      "minor": 8
    },
    "by_type": {
      "forbidden_dependency": 10,
      "layer_skip": 6,
      "cycle": 3,
      "missing_dependency": 4,
      "naming_violation": 2
    },
    "by_component": [
      { "component": "UILayer", "violations": 8 },
      { "component": "ServiceLayer", "violations": 5 },
      { "component": "RepositoryLayer", "violations": 3 }
    ],
    "top_violated_rules": [
      {
        "rule_id": "rule-uuid",
        "rule_text": "UI must not access database",
        "violation_count": 5,
        "severity": "critical"
      }
    ]
  }
}
```

---

### 5.13 Audit Logs

#### `GET /audit-logs`

**Roles:** `admin`

**Query Params:** `?user_id=<uuid>&entity_type=architecture_version&action=status_changed&from=2026-03-01&to=2026-03-04&page=1&per_page=50`

**Response (200):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "log-uuid",
      "user": {
        "id": "user-uuid",
        "full_name": "Jane Smith",
        "email": "architect@company.com"
      },
      "action": "architecture_version.status_changed",
      "entity_type": "architecture_version",
      "entity_id": "version-uuid",
      "old_value": { "status": "approved" },
      "new_value": { "status": "active" },
      "ip_address": "192.168.1.100",
      "created_at": "2026-03-04T10:30:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

## 6. CI/CD Webhook Payload Contracts

### 6.1 GitHub Actions Webhook

#### Incoming Payload: `POST /webhooks/github`

GitHub sends this on push/PR events. The platform verifies the webhook signature using the `webhook_secret`.

**Headers:**
```
X-GitHub-Event: push | pull_request
X-Hub-Signature-256: sha256=<hmac_hex_digest>
X-GitHub-Delivery: <delivery-uuid>
Content-Type: application/json
```

**Push Event Payload (relevant fields):**
```json
{
  "ref": "refs/heads/main",
  "after": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "before": "0000000000000000000000000000000000000000",
  "repository": {
    "full_name": "acme/payment-service",
    "clone_url": "https://github.com/acme/payment-service.git",
    "default_branch": "main"
  },
  "head_commit": {
    "id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "message": "Add new payment processor",
    "author": {
      "name": "John Doe",
      "email": "john@acme.com"
    }
  },
  "sender": {
    "login": "johndoe"
  }
}
```

**Pull Request Event Payload (relevant fields):**
```json
{
  "action": "opened",
  "number": 42,
  "pull_request": {
    "head": {
      "sha": "a1b2c3d4e5f6...",
      "ref": "feature/new-payment"
    },
    "base": {
      "sha": "f6e5d4c3b2a1...",
      "ref": "main"
    },
    "title": "Add new payment processor",
    "user": {
      "login": "johndoe"
    }
  },
  "repository": {
    "full_name": "acme/payment-service",
    "clone_url": "https://github.com/acme/payment-service.git"
  }
}
```

**Platform's Internal Processing:**
1. Verify HMAC-SHA256 signature
2. Match `repository.full_name` to a registered project
3. Extract `commit_hash` and `branch`
4. Queue compliance check job

**Platform's Response to GitHub (200):**
```json
{
  "status": "success",
  "data": {
    "message": "Compliance check queued",
    "report_id": "report-uuid",
    "project_id": "project-uuid"
  }
}
```

---

### 6.2 GitLab CI Webhook

#### Incoming Payload: `POST /webhooks/gitlab`

**Headers:**
```
X-Gitlab-Event: Push Hook | Merge Request Hook
X-Gitlab-Token: <webhook_secret>
Content-Type: application/json
```

**Push Hook Payload (relevant fields):**
```json
{
  "object_kind": "push",
  "ref": "refs/heads/main",
  "checkout_sha": "a1b2c3d4e5f6...",
  "before": "0000000000000000000000000000000000000000",
  "after": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "project": {
    "path_with_namespace": "acme/payment-service",
    "git_http_url": "https://gitlab.com/acme/payment-service.git",
    "default_branch": "main"
  },
  "commits": [
    {
      "id": "a1b2c3d4e5f6...",
      "message": "Add new payment processor",
      "author": {
        "name": "John Doe",
        "email": "john@acme.com"
      }
    }
  ]
}
```

**Merge Request Hook Payload (relevant fields):**
```json
{
  "object_kind": "merge_request",
  "object_attributes": {
    "iid": 42,
    "title": "Add new payment processor",
    "source_branch": "feature/new-payment",
    "target_branch": "main",
    "last_commit": {
      "id": "a1b2c3d4e5f6..."
    },
    "action": "open",
    "state": "opened"
  },
  "project": {
    "path_with_namespace": "acme/payment-service",
    "git_http_url": "https://gitlab.com/acme/payment-service.git"
  }
}
```

---

### 6.3 CI/CD Status Callback

When a compliance check completes, the platform can report status back to the CI/CD provider.

#### GitHub Check Run (via GitHub API)

The platform creates/updates a GitHub Check Run:

```json
{
  "name": "ArchGuard Compliance",
  "head_sha": "a1b2c3d4e5f6...",
  "status": "completed",
  "conclusion": "failure",
  "output": {
    "title": "Architecture Compliance Failed",
    "summary": "Health Score: 72.5/100 | 2 critical, 3 major, 3 minor violations",
    "text": "## Violations Found\n\n### Critical\n- **Forbidden Dependency**: UILayer → DatabaseLayer (app/views/dashboard.py:15)\n- **Forbidden Dependency**: UILayer → DatabaseLayer (app/views/reports.py:23)\n\n### Major\n- **Layer Skip**: ControllerLayer → RepositoryLayer (app/controllers/user.py:45)\n...",
    "annotations": [
      {
        "path": "app/views/dashboard.py",
        "start_line": 15,
        "end_line": 15,
        "annotation_level": "failure",
        "message": "Forbidden dependency: UILayer → DatabaseLayer. Use ServiceLayer as intermediary.",
        "title": "Architecture Violation: Forbidden Dependency"
      }
    ]
  }
}
```

#### GitLab Commit Status (via GitLab API)

```json
{
  "state": "failed",
  "name": "archguard/compliance",
  "target_url": "https://app.archguard.dev/projects/project-uuid/reports/report-uuid",
  "description": "Health Score: 72.5 | 2 critical violations found"
}
```

---

### 6.4 GitHub Actions Integration Example

```yaml
# .github/workflows/archguard.yml
name: Architecture Compliance Check

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run ArchGuard Compliance Check
        run: |
          RESPONSE=$(curl -s -X POST \
            "https://api.archguard.dev/api/v1/projects/${{ secrets.ARCHGUARD_PROJECT_ID }}/compliance/check" \
            -H "X-API-Key: ${{ secrets.ARCHGUARD_TOKEN }}" \
            -H "X-Project-ID: ${{ secrets.ARCHGUARD_PROJECT_ID }}" \
            -H "Content-Type: application/json" \
            -d '{
              "commit_hash": "${{ github.sha }}",
              "branch": "${{ github.ref_name }}",
              "trigger": "ci_cd",
              "options": {
                "fail_on_critical": true,
                "auto_analyze": true
              }
            }')
          
          REPORT_ID=$(echo $RESPONSE | jq -r '.data.report_id')
          echo "REPORT_ID=$REPORT_ID" >> $GITHUB_ENV

      - name: Poll for results
        run: |
          for i in $(seq 1 60); do
            RESULT=$(curl -s \
              "https://api.archguard.dev/api/v1/projects/${{ secrets.ARCHGUARD_PROJECT_ID }}/compliance/reports/${{ env.REPORT_ID }}" \
              -H "X-API-Key: ${{ secrets.ARCHGUARD_TOKEN }}" \
              -H "X-Project-ID: ${{ secrets.ARCHGUARD_PROJECT_ID }}")
            
            STATUS=$(echo $RESULT | jq -r '.data.status')
            
            if [ "$STATUS" = "passed" ]; then
              echo "✅ Compliance check passed!"
              SCORE=$(echo $RESULT | jq -r '.data.health_score')
              echo "Health Score: $SCORE"
              exit 0
            elif [ "$STATUS" = "failed" ]; then
              echo "❌ Compliance check failed!"
              echo $RESULT | jq '.data.violation_summary'
              exit 1
            elif [ "$STATUS" = "error" ]; then
              echo "⚠️ Compliance check errored"
              exit 1
            fi
            
            sleep 5
          done
          echo "⏰ Compliance check timed out"
          exit 1
```

### 6.5 GitLab CI Integration Example

```yaml
# .gitlab-ci.yml
archguard-compliance:
  stage: test
  image: curlimages/curl:latest
  script:
    - |
      RESPONSE=$(curl -s -X POST \
        "https://api.archguard.dev/api/v1/projects/${ARCHGUARD_PROJECT_ID}/compliance/check" \
        -H "X-API-Key: ${ARCHGUARD_TOKEN}" \
        -H "X-Project-ID: ${ARCHGUARD_PROJECT_ID}" \
        -H "Content-Type: application/json" \
        -d "{
          \"commit_hash\": \"${CI_COMMIT_SHA}\",
          \"branch\": \"${CI_COMMIT_REF_NAME}\",
          \"trigger\": \"ci_cd\",
          \"options\": {
            \"fail_on_critical\": true,
            \"auto_analyze\": true
          }
        }")
      REPORT_ID=$(echo $RESPONSE | jq -r '.data.report_id')
      
      # Poll for results
      for i in $(seq 1 60); do
        RESULT=$(curl -s \
          "https://api.archguard.dev/api/v1/projects/${ARCHGUARD_PROJECT_ID}/compliance/reports/${REPORT_ID}" \
          -H "X-API-Key: ${ARCHGUARD_TOKEN}" \
          -H "X-Project-ID: ${ARCHGUARD_PROJECT_ID}")
        STATUS=$(echo $RESULT | jq -r '.data.status')
        if [ "$STATUS" = "passed" ]; then exit 0; fi
        if [ "$STATUS" = "failed" ] || [ "$STATUS" = "error" ]; then
          echo $RESULT | jq '.data'
          exit 1
        fi
        sleep 5
      done
      exit 1
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

---

## Appendix A: Health Score Calculation

```
Base Score = 100

For each violation:
  Critical: -10 points
  Major:    -5  points
  Minor:    -1  point

Health Score = max(0, Base Score - Total Penalty)
```

Example:
- 2 critical (-20), 3 major (-15), 3 minor (-3) = 100 - 38 = **62.0**

The score is clamped to `[0, 100]`.

---

## Appendix B: Architecture Version State Machine

```
                    ┌──────────────┐
                    │    draft     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
              ┌─────│ under_review │
              │     └──────┬───────┘
              │            │
     (rejected)     ┌──────▼───────┐
              │     │   approved   │
              │     └──────┬───────┘
              │            │
              │     ┌──────▼───────┐
              └────▶│    active    │◀── (only one per project)
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  deprecated  │
                    └──────────────┘
```

---

## Appendix C: Compliance Check Execution Flow

```
POST /compliance/check
       │
       ▼
  ┌─────────┐    auto_analyze=true?    ┌──────────────┐
  │  Queue   │ ──────────────────────▶ │ Static Code  │
  │  Job     │                          │ Analysis     │
  └────┬─────┘                          └──────┬───────┘
       │                                       │
       │◀──────────────────────────────────────┘
       ▼
  ┌──────────────────┐
  │ Load Intended     │  (Neo4j: IntendedComponent graph)
  │ Architecture      │
  └────────┬──────────┘
       │
       ▼
  ┌──────────────────┐
  │ Load Actual       │  (Neo4j: ActualComponent graph)
  │ Code Graph        │
  └────────┬──────────┘
       │
       ▼
  ┌──────────────────┐
  │ Resolve Mappings  │  (IntendedComponent ─MAPS_TO─▶ ActualComponent)
  └────────┬──────────┘
       │
       ▼
  ┌──────────────────┐
  │ Run Violation     │
  │ Detectors:        │
  │  • Forbidden deps │
  │  • Missing deps   │
  │  • Layer skips    │
  │  • Cycles         │
  └────────┬──────────┘
       │
       ▼
  ┌──────────────────┐
  │ Calculate Score   │
  │ Generate Report   │
  │ Store Violations  │
  └────────┬──────────┘
       │
       ▼
  ┌──────────────────┐
  │ Report Status     │  (GitHub Check Run / GitLab Commit Status)
  │ Back to CI/CD     │
  └──────────────────┘
```
