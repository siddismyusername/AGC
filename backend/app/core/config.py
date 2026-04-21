from __future__ import annotations

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import json


class Settings(BaseSettings):
    # ── General ──
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    PROJECT_NAME: str = "ArchGuard"
    API_V1_PREFIX: str = "/api/v1"

    # ── PostgreSQL ──
    DATABASE_URL: str

    # ── Neo4j ──
    NEO4J_URI: str
    NEO4J_USER: str
    NEO4J_PASSWORD: str

    # ── Redis ──
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Document Extraction ──
    DOCUMENT_EXTRACTOR_PROVIDER: str = "auto"

    # ── Local AI Pipeline (Ollama) ──
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_TEXT_MODEL: str = "qwen2.5-coder:7b"
    OLLAMA_VISION_MODEL: str = "qwen2.5-vl:latest"

    # ── Google Gemini (Fallback) ──
    GEMINI_API_KEY: str | None = None


    # ── OCR Intake ──
    DOCUMENT_OCR_PROVIDER: str = "auto"
    DOCUMENT_OCR_TEXT_PREVIEW_LIMIT: int = 1000

    # ── Worker Replay Controls ──
    WORKER_REPLAY_COOLDOWN_SECONDS: int = 300

    # ── JWT ──
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── CORS ──
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
