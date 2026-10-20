"""Shared fixtures. `db` is a session on the real dev database inside a transaction
that is always rolled back, so tests leave nothing behind."""

import uuid

import pytest
from sqlalchemy import pool, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.config import get_settings
from app.db.session import async_database_url

needs_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")


@pytest.fixture
async def db():
    engine = create_async_engine(
        async_database_url(get_settings().database_url), poolclass=pool.NullPool
    )
    async with engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(
            bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        yield session
        await session.close()
        await trans.rollback()
    await engine.dispose()


@pytest.fixture
async def users(db):
    """Two throwaway auth users (rolled back with everything else)."""
    ids = [uuid.uuid4(), uuid.uuid4()]
    for uid in ids:
        await db.execute(
            text(
                "insert into auth.users (id, email, aud, role) "
                "values (:id, :email, 'authenticated', 'authenticated')"
            ),
            {"id": uid, "email": f"test-{uid}@example.invalid"},
        )
    return ids
