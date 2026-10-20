"""Documents API against the real dev database, inside a transaction that is always
rolled back, so nothing is left behind. Storage and the job queue are faked.
Skipped when no DATABASE_URL is configured (e.g. in CI)."""

import uuid
from datetime import date
from decimal import Decimal

import httpx
import pytest
from fastapi import Request

from app import auth
from app.config import get_settings
from app.db.models import Document, DocumentPage
from app.db.session import get_session
from app.main import app
from app.routes import documents as documents_route

pytestmark = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")

SHA_A = "a" * 64


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
    r = await a.patch(
        f"/documents/{doc['id']}",
        json={"title": "October bill", "docType": "bill", "tags": ["Power", " power", "home"]},
    )
    assert r.json()["title"] == "October bill"
    assert r.json()["tags"] == ["home", "power"]

    assert (await a.delete(f"/documents/{doc['id']}")).status_code == 204
    assert (await a.get(f"/documents/{doc['id']}")).status_code == 404
    assert files == {}  # the stored file was deleted too


async def mark_read(db, doc_id: str, status="needs_review"):
    """Pretend the worker read the document: two pages and some fields."""
    doc = await db.get(Document, uuid.UUID(doc_id))
    for n in (1, 2):
        db.add(
            DocumentPage(
                document_id=doc.id,
                user_id=doc.user_id,
                page_no=n,
                image_key=f"{doc.user_id}/{doc.id}/pages/{n}.webp",
                width=1200,
                height=1697,
                text="",
                text_source="pdf_text",
            )
        )
    doc.status, doc.page_count, doc.doc_type = status, 2, "bill"
    doc.vendor, doc.amount, doc.due_date = "BrightGrid", Decimal("2340.50"), date(2025, 11, 5)
    doc.reference_masked = "●●●● 4821"
    doc.field_boxes = {"amount": {"page": 1, "x": 50, "y": 20, "w": 20, "h": 2}}
    doc.confidence = {"vendor": 0.95, "amount": 0.6, "dueDate": 0.9, "referenceMasked": 0.9}
    await db.flush()
    return doc


async def test_read_document_has_pages_fields_and_thumbnail(client_for, fake_storage, db):
    files, _ = fake_storage
    a = client_for(0)
    doc = await upload(a, files)
    await mark_read(db, doc["id"])

    detail = (await a.get(f"/documents/{doc['id']}")).json()
    assert [p["url"].rsplit("/", 1)[-1] for p in detail["pages"]] == ["1.webp", "2.webp"]
    assert detail["pages"][0]["width"] == 1200 and detail["pageCount"] == 2
    assert detail["fields"] == {
        "vendor": "BrightGrid",
        "amount": 2340.5,
        "dueDate": "2025-11-05",
        "referenceMasked": "●●●● 4821",
    }
    assert detail["fieldBoxes"]["amount"]["page"] == 1
    assert detail["expiryDate"] == "2025-11-05"  # bills show their due date as the deadline

    [listed] = (await a.get("/documents")).json()
    assert listed["thumbnailUrl"].endswith("/pages/1.webp")  # PDFs get thumbnails now
    assert listed["vendor"] == "BrightGrid" and listed["amount"] == 2340.5


async def test_fix_and_confirm_fields(client_for, fake_storage, db):
    files, _ = fake_storage
    a, b = client_for(0), client_for(1)
    doc = await upload(a, files)
    url = f"/documents/{doc['id']}/fields"

    # Still being read: nothing to fix yet.
    assert (await a.patch(url, json={"fields": {}, "confirm": True})).status_code == 409

    await mark_read(db, doc["id"])
    body = {"fields": {"amount": 2430.5, "vendor": None}, "confirm": True}
    assert (await b.patch(url, json=body)).status_code == 404

    r = await a.patch(url, json=body)
    assert r.status_code == 200 and r.json()["status"] == "ready"
    detail = (await a.get(f"/documents/{doc['id']}")).json()
    assert detail["fields"]["amount"] == 2430.5
    assert detail["fields"]["vendor"] == "BrightGrid"  # empty means "unchanged"
    assert detail["confidence"]["amount"] == 1.0
    # The masked reference can't be overwritten.
    r = await a.patch(url, json={"fields": {"referenceMasked": "1234 5678 9012"}})
    assert (await a.get(f"/documents/{doc['id']}")).json()["fields"]["referenceMasked"] == (
        "●●●● 4821"
    )


async def test_delete_removes_page_images(client_for, fake_storage, db):
    files, _ = fake_storage
    a = client_for(0)
    doc = await upload(a, files)
    await mark_read(db, doc["id"], status="ready")
    deleted: list[str] = []
    real_delete = documents_route.storage.delete_objects

    async def spy(keys):
        deleted.extend(keys)
        await real_delete(keys)

    documents_route.storage.delete_objects = spy
    try:
        assert (await a.delete(f"/documents/{doc['id']}")).status_code == 204
    finally:
        documents_route.storage.delete_objects = real_delete
    assert sum(k.endswith(".webp") for k in deleted) == 2 and len(deleted) == 3


async def test_daily_upload_limit(client_for, fake_storage, monkeypatch):
    files, _ = fake_storage
    monkeypatch.setattr(get_settings(), "daily_document_limit", 1)
    a = client_for(0)
    await upload(a, files)
    r = await a.post(
        "/documents",
        json={
            "filename": "b.pdf",
            "sizeBytes": 1,
            "mimeType": "application/pdf",
            "sha256": "b" * 64,
        },
    )
    assert r.status_code == 429 and "Try again tomorrow" in r.json()["detail"]
