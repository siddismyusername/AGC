from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"

load_dotenv(BACKEND / ".env", override=False)

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://archguard:archguard_secret@localhost:5432/archguard")
os.environ.setdefault("NEO4J_URI", "bolt://localhost:7687")
os.environ.setdefault("NEO4J_USER", "neo4j")
os.environ.setdefault("NEO4J_PASSWORD", "archguard_neo4j")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))