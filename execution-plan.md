# ArchGuard Execution Plan

## Current Sprint Status

**Date:** April 21, 2026

### Active Tasks

P0 (Must Complete):
- [x] Extraction provider production path
- [x] OCR production path
- [x] End-to-end contract integrity
- [x] Regression confidence tests

P1:
- [x] CI/CD webhook strictness
- [x] Dashboard governance parity

P2:
- [x] Replay/worker observability

### Completed Features

**Backend:**
- Auth system (register/login/refresh/logout)
- Organizations API
- Projects CRUD with architecture versions
- Rules management (create/update/batch/deactivate)
- Neo4j graph service (components, relationships, mappings)
- Compliance engine (violation detection, health scoring)
- Static analyzer (Python AST parsing)
- Webhooks & CI/CD tokens
- Documents API (upload/list/get/delete/process)
- AI extraction endpoints (rules, entities, relationships)
- OCR provider scaffold
- Diagram hint extraction & apply
- Worker health & replay actions
- Analytics endpoints (summary, history, trends, worker-ops)
- Dead-letter & replay API

**Frontend:**
- Landing page
- Login & Register
- Dashboard with summary/trends/activity
- Projects list & creation
- Graph explorer (create/delete components & relationships)
- Rule editor (CRUD, search, pagination, audit)
- Documents management (upload, list, process, apply hints)
- Organization settings

**Infrastructure:**
- Docker compose (postgres, neo4j, redis)
- Alembic migrations
- Celery worker for background jobs

---

## Next Actions

1. **Start Neo4j** before running backend:
   ```bash
   neo4j start
   # or via docker:
   docker run -p 7474:7474 -p 7687:7687 neo4j
   ```

2. **Run migrations**:
   ```bash
   cd backend && alembic upgrade head
   ```

3. **Start services**:
   - Backend: `uvicorn app.main:app`
   - Frontend: `npm run dev` (in frontend/)
   - Worker: `celery -A app.core.celery_app worker --pool=solo`

---

## Quality Gates

1. No feature without error handling
2. All APIs return standardized envelopes
3. Auth flows handle token expiry
4. Every feature has test coverage
5. No mock data when real data exists

---

## Quick Reference

| Service | URL |
|---------|-----|
| Backend | http://127.0.0.1:8000 |
| Frontend | http://localhost:3000 |
| Neo4j | http://localhost:7474 |

**Env file:** `backend/.env`