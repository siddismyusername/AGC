"""ArchGuard — FastAPI application entry point."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings
from app.core.database import engine
from app.core.neo4j import Neo4jConnection

settings = Settings()  # type: ignore[call-arg]

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("archguard")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # ── Startup ──────────────────────────────────────────────
    logger.info("Connecting to Neo4j …")
    await Neo4jConnection.connect()

    # Create indexes on first boot
    from app.services.graph_service import setup_indexes

    driver = Neo4jConnection.get_driver()
    async with driver.session() as session:
        await setup_indexes(session)
    logger.info("Neo4j connected & indexes ensured.")

    # Import models so Alembic / Base.metadata knows them
    from app.models import audit, compliance, document, organization, project, rule, user  # noqa: F401

    logger.info("ArchGuard API ready  ✓")
    yield

    # ── Shutdown ─────────────────────────────────────────────
    logger.info("Shutting down …")
    await engine.dispose()
    await Neo4jConnection.close()
    logger.info("Neo4j connection closed.")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        description="AI-Driven Architecture Governance & Conformance Platform",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ─────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routes ───────────────────────────────────────────────
    from app.api.v1.router import api_router

    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    # ── Health check (no auth) ───────────────────────────────
    @app.get("/health", tags=["Health"])
    async def health():
        return {"status": "ok", "service": settings.PROJECT_NAME}

    return app


app = create_app()
