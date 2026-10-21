"""Shared fixtures. `db` is a session on the real dev database inside a transaction
that is always rolled back, so tests leave nothing behind."""

import uuid

import httpx
import pytest
from fastapi import Request
from sqlalchemy import pool, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app import auth
from app.config import get_settings
from app.db.session import async_database_url, get_session
from app.main import app
from app.providers import storage
from app.routes import documents as documents_route

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


@pytest.fixture
def fake_storage(monkeypatch):
    files: dict[str, int] = {}
    queued: list[uuid.UUID] = []

    async def create_upload_url(key):
        return f"https://storage.test/upload/{key}"

    async def object_size(key):
        return files.get(key)

    async def signed_urls(keys, expires_in=600):
        return {k: f"https://storage.test/view/{k}" for k in keys}

    async def delete_objects(keys):
        for k in keys:
            files.pop(k, None)

    async def enqueue(document_id):
        queued.append(document_id)
        return True

    for name, fn in [
        ("create_upload_url", create_upload_url),
        ("object_size", object_size),
        ("signed_urls", signed_urls),
        ("delete_objects", delete_objects),
    ]:
        monkeypatch.setattr(storage, name, fn)
    monkeypatch.setattr(documents_route, "enqueue_processing", enqueue)
    return files, queued


@pytest.fixture
async def client_for(db, users, fake_storage):
    """`client_for(0)` → an HTTP client signed in as the first test user."""
    app.dependency_overrides[get_session] = lambda: db
    clients = []

    def make(index: int) -> httpx.AsyncClient:
        uid = users[index]
        # Each client sends a header naming its user; the override below trusts it (tests only).
        c = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
            headers={"x-test-user": str(uid)},
        )
        clients.append(c)
        return c

    async def test_claims(request: Request):
        uid = request.headers["x-test-user"]
        return {"sub": uid, "email": f"test-{uid}@example.invalid"}

    app.dependency_overrides[auth.current_claims] = test_claims
    yield make
    for c in clients:
        await c.aclose()
    app.dependency_overrides.clear()
