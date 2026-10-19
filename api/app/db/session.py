"""Database connection for the API.

One engine (a pool of connections) for the whole app; each request borrows a session
from it and gives it back when the request ends.
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings


def async_database_url(url: str) -> str:
    """Supabase gives `postgresql://...`; SQLAlchemy needs to be told to use the
    psycopg (v3) driver, which supports async."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


engine = create_async_engine(
    async_database_url(get_settings().database_url) or "postgresql+psycopg://",
    pool_pre_ping=True,  # quietly replace connections the pooler has closed
    pool_size=5,
    max_overflow=5,
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: `session: AsyncSession = Depends(get_session)`."""
    async with SessionLocal() as session:
        yield session
