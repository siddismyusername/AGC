# Product Requirements Document (PRD)

## 1. Executive Summary
**Project Name:** AI-Driven Architecture Governance & Conformance Platform

The **AI-Driven Architecture Governance & Conformance Platform** is a multi-project system designed to make software architecture executable, enforceable, and intelligent. It bridges the gap between architectural documentation and actual code by extracting intent from text/diagrams and enforcing it through CI/CD pipelines.

By leveraging **Graph Theory** (Neo4j for structural modeling), **NLP** (Transformers for rule extraction), and **Computer Vision** (for diagram analysis), this platform solves the problem of "architecture drift" where code diverges from the intended design over time.

## 2. Problem Statement
In modern software development, architecture documentation (wikis, diagrams) is static and disconnected from the codebase.
-   **Drift**: Code evolves faster than documentation, leading to silent violations (e.g., circular dependencies, layer skipping).
-   **Manual Review**: Architects cannot manually review every PR for structural compliance.
-   **Invisibility**: There is no live, queryable model of what the system *actually* looks like vs. what it *should* look like.

## 3. Target Audience
-   **Software Architects**: To define rules, monitor drift, and enforce standards across multiple teams.
-   **Developers**: To get immediate feedback on architecture violations during the commit/PR process.
-   **DevOps/Platform Engineers**: To integrate automated governance into CI/CD pipelines.
-   **Engineering Managers**: To view high-level compliance scores and technical debt metrics.

## 4. User Stories
### Architects
-   As an architect, I want to define architecture rules in plain English (e.g., "Services must not call the Database directly") so that I don't have to learn a complex constraint language.
-   As an architect, I want to see a visual graph of the current project structure to identify hotspots and cycles.
-   As an architect, I want to receive alerts when a critical architecture rule is violated.

### Developers
-   As a developer, I want my PR to fail or warn me if I introduce a forbidden dependency so I can fix it before merging.
-   As a developer, I want to see exactly which line of code caused a violation so I can remediate it quickly.

### DevOps
-   As a DevOps engineer, I want to plug this tool into GitHub Actions/GitLab CI with minimal configuration so it scales across all projects.

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
| **FR-10** | **Diagram Processing**: (Advanced) Detect components and relationships from image-based architecture diagrams. | P2 |
| **FR-11** | **Multimodal Alignment**: (Research) Correlate terms in text with shapes in diagrams to build a unified model. | P3 |

### 5.3 User Interface
| ID | Requirement | Priority |
|----|-------------|----------|
| **FR-12** | **Dashboard**: Visual summary of compliance status, recent violations, and project health trends. | P1 |
| **FR-13** | **Graph Visualization**: Interactive node-link diagram showing the architecture and violations (using React Flow or similar). | P1 |
| **FR-14** | **Rule Editor**: Interface to manage text-based rules and review AI-extracted constraints. | P1 |

## 6. Non-Functional Requirements
-   **Performance**:
    -   API Response time < 500ms for 95th percentile.
    -   UI Load time < 3s.
    -   Compliance checks must complete within standard CI/CD timeout limits (e.g., < 5-10 mins for large repos).
-   **Scalability**:
    -   Horizontal scaling of worker nodes to handle concurrent CI jobs.
    -   Microservices architecture for isolation of AI heavy-lifting.
-   **Security**:
    -   Role-Based Access Control (RBAC).
    -   Encryption in transit (HTTPS) and at rest.
    -   Secure handling of source code (analysis only, execution sandbox if needed).
-   **Reliability**:
    -   Deterministic core must be 100% accurate; AI suggestions can be probabilistic but must be flagged as such ("human-in-the-loop").

## 7. Technical Architecture

### 7.1 Tech Stack
-   **Backend**: Python 3.11+ (FastAPI, Celery)
-   **Frontend**: Next.js, TypeScript, TailwindCSS, shadcn/ui
-   **Database**:
    -   **Graph**: Neo4j (Architecture & Code relationships)
    -   **Relational**: PostgreSQL (User data, Projects, Reports)
    -   **Vector**: FAISS/Milvus (Embeddings for AI search)
    -   **Cache/Queue**: Redis
-   **Infrastructure**: Docker, Docker Compose (Kubernetes optional for prod)

### 7.2 Key Components
1.  **API Gateway**: Unified entry point.
2.  **Project Service**: Manages crude operations for projects/users.
3.  **Modeling Service**: Interfaces with Neo4j to manage the "Intended" graph.
4.  **Analysis Service**: Runs language-specific parsers to build the "Actual" graph.
5.  **Compliance Service**: The diff engine (Intent vs Actual).
6.  **AI Worker**: Specialized GPU-enabled worker for NLP/CV tasks.

## 8. Development Roadmap

### Phase 1: Foundation (MVP)
-   Setup Neo4j, Postgres, FastAPI.
-   Implement Basic Auth & Project Management.
-   Build Python Static Analyzer.
-   Implement "Core Compliance" (Manual rule entry + Graph diff).
-   Basic CI/CD Webhook.

### Phase 2: Visualization & UI
-   Next.js Dashboard with shadcn/ui.
-   Visual Graph Explorer.
-   Detailed Compliance Reports.

### Phase 3: AI Augmentation
-   Train/Deploy NLP model for Rule Extraction.
-   Integrate "Text-to-Constraint" workflow.
-   Feedback loop for model improvement.

### Phase 4: Advanced Features
-   Diagram parsing (Computer Vision).
-   Multimodal alignment.
-   Advanced Analytics & Forecasting.

## 9. Success Metrics
-   **Adoption**: Number of projects integrated.
-   **Catch Rate**: Number of violations prevented at PR stage.
-   **Accuracy**: F1 Score of NLP rule extraction > 0.8.
-   **Performance**: Average CI check time < 2 mins.
