"""The whole reading pipeline with fake Claude, Voyage and Storage, saved into the
dev database inside a rolled-back transaction."""

import pytest
from sqlalchemy import func, select

from app.db.models import EMBEDDING_DIMS, Chunk, Document, DocumentPage, User
from app.pipeline import run
from app.pipeline.read import ReadError
from app.providers.llm import Extraction, FieldValue, SeenLine, Transcription
from tests.conftest import needs_db
from tests.factories import photo_jpeg, text_pdf

NONE = FieldValue(value=None, as_printed=None, page=None, confidence=0)


class FakeReader:
    provider, fast_model, smart_model, max_concurrency = "fake", "fast-1", "smart-1", 2

    def __init__(self, readable=True):
        self.readable = readable
        self.extracted_text = ""

    async def transcribe(self, image_jpeg):
        lines = [
            SeenLine(text="Spinwell Appliances", x=10, y=5, w=50, h=3),
            SeenLine(text="Aadhaar 2341 2341 2346", x=10, y=12, w=60, h=3),
            SeenLine(text="Warranty valid till 14/02/2027", x=10, y=20, w=70, h=3),
        ]
        return Transcription(readable=self.readable, lines=lines if self.readable else [])

    async def extract(self, text, filename):
        self.extracted_text = text
        return Extraction(
            doc_type="warranty",
            title="Spinwell washing machine warranty",
            tags=["Washing Machine", "spinwell"],
            vendor=FieldValue(value="Spinwell", as_printed="Spinwell", page=1, confidence=0.95),
            amount=NONE,
            doc_date=NONE,
            expiry_date=FieldValue(
                value="2027-02-14", as_printed="14/02/2027", page=1, confidence=0.9
            ),
            due_date=NONE,
            reference=NONE,
        )


class FakeEmbedder:
    async def embed(self, texts, input_type):
        return [[1.0] + [0.0] * (EMBEDDING_DIMS - 1) for _ in texts]

    async def rerank(self, query, documents, top_k):
        return []


@pytest.fixture
def fake_files(monkeypatch):
    stored: dict[str, bytes] = {}

    def use(data: bytes):
        async def download(key):
            return data

        async def upload(key, body, content_type):
            stored[key] = body

        monkeypatch.setattr(run.storage, "download", download)
        monkeypatch.setattr(run.storage, "upload", upload)
        return stored

    return use


async def make_doc(db, user_id, mime="image/jpeg", name="warranty.jpg") -> Document:
    db.add(User(id=user_id, email="t@example.invalid"))
    doc = Document(
        user_id=user_id,
        file_key=f"{user_id}/x/{name}",
        original_filename=name,
        mime_type=mime,
        size_bytes=1,
        status="processing",
    )
    db.add(doc)
    await db.flush()
    return doc


def job(doc: Document) -> run.DocInput:
    return run.DocInput(doc.id, doc.user_id, doc.file_key, doc.mime_type, doc.original_filename)


@needs_db
async def test_photo_is_read_masked_and_saved(db, users, fake_files):
    stored = fake_files(photo_jpeg())
    doc = await make_doc(db, users[0])
    reader = FakeReader()

    result = await run.read_document(job(doc), reader, FakeEmbedder())
    await run.save_result(db, doc, result)
    await db.flush()

    # Claude's transcription was masked before extraction saw it.
    assert "2341 2341 2346" not in reader.extracted_text
    assert "●●●● 2346" in reader.extracted_text

    assert doc.status == "ready"  # vendor + expiry found with high confidence
    assert doc.read_by == "fake:fast-1,smart-1"  # a photo needs the smart model too
    assert doc.doc_type == "warranty" and doc.title == "Spinwell washing machine warranty"
    assert doc.tags == ["spinwell", "washing machine"]
    assert str(doc.expiry_date) == "2027-02-14" and doc.page_count == 1
    assert doc.field_boxes["expiryDate"]["page"] == 1
    assert 19 < doc.field_boxes["expiryDate"]["y"] < 21  # on the "valid till" line

    [page] = (
        await db.scalars(select(DocumentPage).where(DocumentPage.document_id == doc.id))
    ).all()
    assert page.text_source == "vision" and "●●●● 2346" in page.text
    assert list(stored) == [page.image_key] and page.image_key.endswith("/pages/1.webp")
    assert await db.scalar(select(func.count()).where(Chunk.document_id == doc.id)) == 1


@needs_db
async def test_running_twice_replaces_the_first_attempt(db, users, fake_files):
    fake_files(text_pdf([["Spinwell Appliances", "Warranty valid till 14/02/2027"]] * 3))
    doc = await make_doc(db, users[0], mime="application/pdf", name="w.pdf")
    for _ in range(2):
        result = await run.read_document(job(doc), FakeReader(), FakeEmbedder())
        await run.save_result(db, doc, result)
        await db.flush()

    pages = await db.scalar(select(func.count()).where(DocumentPage.document_id == doc.id))
    chunks = await db.scalar(select(func.count()).where(Chunk.document_id == doc.id))
    assert (pages, chunks, doc.page_count) == (3, 3, 3)
    assert doc.read_by == "fake:fast-1"  # typed PDF: text only, no vision
    assert {p for p in (await db.scalars(select(DocumentPage.text_source))).all()} == {"pdf_text"}


@needs_db
async def test_unreadable_photo_is_a_friendly_error(db, users, fake_files):
    fake_files(photo_jpeg())
    doc = await make_doc(db, users[0])
    with pytest.raises(ReadError, match="couldn't read any text"):
        await run.read_document(job(doc), FakeReader(readable=False), FakeEmbedder())
