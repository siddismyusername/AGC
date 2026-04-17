"""Aggregated v1 API router."""
from fastapi import APIRouter

from app.api.v1.endpoints import auth, compliance, graph, projects, webhooks

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(projects.router, prefix="")
api_router.include_router(graph.router, prefix="")
api_router.include_router(compliance.router, prefix="")
api_router.include_router(webhooks.router, prefix="")
