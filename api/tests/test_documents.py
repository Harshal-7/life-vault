"""Documents API against the real dev database, inside a transaction that is always
rolled back, so nothing is left behind. Storage and the job queue are faked.
Skipped when no DATABASE_URL is configured (e.g. in CI)."""

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
from app.routes import documents as documents_route

pytestmark = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")

SHA_A = "a" * 64


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
        monkeypatch.setattr(documents_route.storage, name, fn)
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


async def upload(client, files, name="electricity-bill.pdf", sha=SHA_A):
    r = await client.post(
        "/documents",
        json={"filename": name, "sizeBytes": 1234, "mimeType": "application/pdf", "sha256": sha},
    )
    assert r.status_code == 201, r.text
    doc = r.json()["document"]
    # Pretend the browser PUT the file to storage.
    files[r.json()["uploadUrl"].removeprefix("https://storage.test/upload/")] = 1234
    r = await client.post(f"/documents/{doc['id']}/complete")
    assert r.status_code == 200, r.text
    return r.json()


async def test_upload_flow(client_for, fake_storage):
    files, queued = fake_storage
    a = client_for(0)
    doc = await upload(a, files)
    assert doc["status"] == "processing"
    assert doc["docType"] == "bill"  # guessed from the file name
    assert doc["title"] == "Electricity bill"
    assert queued == [uuid.UUID(doc["id"])]

    listed = (await a.get("/documents")).json()
    assert [d["id"] for d in listed] == [doc["id"]]


async def test_complete_before_file_arrives_is_rejected(client_for):
    a = client_for(0)
    r = await a.post(
        "/documents",
        json={"filename": "x.pdf", "sizeBytes": 10, "mimeType": "application/pdf", "sha256": SHA_A},
    )
    r = await a.post(f"/documents/{r.json()['document']['id']}/complete")
    assert r.status_code == 400


async def test_duplicate_upload_returns_existing(client_for, fake_storage):
    files, _ = fake_storage
    a = client_for(0)
    first = await upload(a, files)
    r = await a.post(
        "/documents",
        json={
            "filename": "again.pdf",
            "sizeBytes": 1234,
            "mimeType": "application/pdf",
            "sha256": SHA_A,
        },
    )
    assert r.status_code == 409
    assert r.json()["existing"]["id"] == first["id"]


async def test_rejects_wrong_type(client_for):
    r = await client_for(0).post(
        "/documents",
        json={
            "filename": "notes.docx",
            "sizeBytes": 10,
            "mimeType": "application/msword",
            "sha256": SHA_A,
        },
    )
    assert r.status_code == 415


async def test_other_users_cannot_see_or_touch_documents(client_for, fake_storage):
    files, _ = fake_storage
    a, b = client_for(0), client_for(1)
    doc = await upload(a, files)
    doc_id = doc["id"]

    assert (await b.get("/documents")).json() == []
    assert (await b.get(f"/documents/{doc_id}")).status_code == 404
    assert (await b.patch(f"/documents/{doc_id}", json={"title": "mine now"})).status_code == 404
    assert (await b.delete(f"/documents/{doc_id}")).status_code == 404
    # The same file uploaded by someone else is not a "duplicate" for them.
    other = await upload(b, files, name="copy.pdf")
    assert other["id"] != doc_id

    # And the owner still has it, untouched.
    mine = (await a.get(f"/documents/{doc_id}")).json()
    assert mine["title"] == "Electricity bill"


async def test_rename_and_delete(client_for, fake_storage):
    files, _ = fake_storage
    a = client_for(0)
    doc = await upload(a, files)
    r = await a.patch(f"/documents/{doc['id']}", json={"title": "October bill", "docType": "bill"})
    assert r.json()["title"] == "October bill"

    assert (await a.delete(f"/documents/{doc['id']}")).status_code == 204
    assert (await a.get(f"/documents/{doc['id']}")).status_code == 404
    assert files == {}  # the stored file was deleted too
