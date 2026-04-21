"""Aggregated v1 API router."""
from fastapi import APIRouter

from app.api.v1.endpoints import analytics, ai, audit, auth, compliance, documents, graph, organizations, projects, webhooks

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(audit.router)
api_router.include_router(organizations.router)
api_router.include_router(analytics.router)
api_router.include_router(ai.router)
api_router.include_router(projects.router, prefix="")
api_router.include_router(documents.router, prefix="")
api_router.include_router(graph.router, prefix="")
api_router.include_router(compliance.router, prefix="")
api_router.include_router(webhooks.router, prefix="")
