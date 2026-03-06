from neo4j import AsyncGraphDatabase, AsyncDriver

from app.core.config import settings


class Neo4jConnection:
    """Manages the Neo4j async driver lifecycle."""

    _driver: AsyncDriver | None = None

    @classmethod
    async def connect(cls) -> None:
        cls._driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )
        # Verify connectivity
        await cls._driver.verify_connectivity()

    @classmethod
    async def close(cls) -> None:
        if cls._driver:
            await cls._driver.close()
            cls._driver = None

    @classmethod
    def get_driver(cls) -> AsyncDriver:
        if cls._driver is None:
            raise RuntimeError("Neo4j driver not initialised. Call connect() first.")
        return cls._driver

    @classmethod
    async def get_session(cls):
        """FastAPI dependency — yields a Neo4j async session."""
        driver = cls.get_driver()
        async with driver.session() as session:
            yield session
