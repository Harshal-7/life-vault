"""The whole reading pipeline for one document:

    download → pages → (photos/scans: Claude reads them) → mask IDs → extract fields
    → highlight boxes → chunks → embeddings → upload page images → save

`read_document` does the slow work without holding a database connection;
`save_result` then writes everything in one transaction, replacing any previous
attempt, so Retry is always safe.
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import Chunk, Document, DocumentPage
from app.pipeline.chunk import TextChunk, chunk_pages, embedding_header
from app.pipeline.fields import FIELDS, Fields, build_fields, needs_review
from app.pipeline.mask import mask_ids
from app.pipeline.read import Box, Line, Page, ReadError, read_file
from app.providers import storage
from app.providers.embeddings import Embedder
from app.providers.llm import Extraction, Reader

log = logging.getLogger(__name__)

UNREADABLE = "We couldn't read any text in this file. Try a sharper photo or the original PDF."
MAX_EXTRACT_CHARS = 60_000  # fields live on the first pages; skip the rest of long manuals
VISION_CONCURRENCY = 3
UPLOAD_CONCURRENCY = 4


@dataclass
class DocInput:
    """What the pipeline needs to know about the document (a plain copy, so no
    database session has to stay open while Claude and Voyage are working)."""

    id: uuid.UUID
    user_id: uuid.UUID
    file_key: str
    mime_type: str
    original_filename: str


@dataclass
class ReadResult:
    pages: list[Page]
    extraction: Extraction
    fields: Fields
    chunks: list[TextChunk]
    vectors: list[list[float]]
    image_keys: list[str]
    timings: dict[str, float] = field(default_factory=dict)


async def read_document(doc: DocInput, reader: Reader, embedder: Embedder) -> ReadResult:
    timings: dict[str, float] = {}
    clock = time.perf_counter()

    def lap(name: str) -> None:
        nonlocal clock
        now = time.perf_counter()
        timings[name] = round(now - clock, 2)
        clock = now

    data = await storage.download(doc.file_key)
    lap("download")

    pages = await asyncio.to_thread(read_file, data, doc.mime_type, get_settings().max_pages)
    lap("pages")

    await _read_images(pages, reader)
    lap("vision")

    for page in pages:
        for line in page.lines:
            line.text = mask_ids(line.text)
    text = "\n\n".join(f"[Page {p.page_no}]\n{p.text}" for p in pages if p.lines)
    if not text.strip():
        raise ReadError(UNREADABLE)

    extraction = await reader.extract(text[:MAX_EXTRACT_CHARS], doc.original_filename)
    fields = build_fields(extraction, pages)
    lap("extract")

    chunks = chunk_pages(pages)
    header = embedding_header(extraction.doc_type, extraction.title, fields.columns.get("vendor"))
    vectors = await embedder.embed([header + c.content for c in chunks], "document")
    lap("embed")

    image_keys = await _upload_pages(doc, pages)
    lap("upload")

    return ReadResult(pages, extraction, fields, chunks, vectors, image_keys, timings)


async def _read_images(pages: list[Page], reader: Reader) -> None:
    """Photos and scanned pages: Claude transcribes them into lines with boxes, so
    from here on they're handled exactly like PDF text."""
    todo = [p for p in pages if p.needs_vision]
    if not todo:
        return
    limit = asyncio.Semaphore(VISION_CONCURRENCY)

    async def one(page: Page) -> None:
        async with limit:
            seen = await reader.transcribe(page.vision_image)
        if seen.readable:
            page.lines = [
                Line(line.text, _clamp(Box(line.x, line.y, line.w, line.h)))
                for line in seen.lines
                if line.text.strip()
            ]

    await asyncio.gather(*(one(p) for p in todo))


def _clamp(box: Box) -> Box:
    x, y = max(0.0, min(100.0, box.x)), max(0.0, min(100.0, box.y))
    return Box(x, y, max(0.0, min(100.0 - x, box.w)), max(0.0, min(100.0 - y, box.h)))


async def _upload_pages(doc: DocInput, pages: list[Page]) -> list[str]:
    keys = [f"{doc.user_id}/{doc.id}/pages/{p.page_no}.webp" for p in pages]
    limit = asyncio.Semaphore(UPLOAD_CONCURRENCY)

    async def one(key: str, page: Page) -> None:
        async with limit:
            await storage.upload(key, page.image, "image/webp")

    await asyncio.gather(*(one(k, p) for k, p in zip(keys, pages, strict=True)))
    return keys


async def save_result(session: AsyncSession, doc: Document, result: ReadResult) -> None:
    """Replace any earlier pages/chunks and fill in the document row."""
    await session.execute(delete(Chunk).where(Chunk.document_id == doc.id))
    await session.execute(delete(DocumentPage).where(DocumentPage.document_id == doc.id))

    session.add_all(
        DocumentPage(
            document_id=doc.id,
            user_id=doc.user_id,
            page_no=page.page_no,
            image_key=key,
            width=page.width,
            height=page.height,
            text=page.text,
            text_source="vision" if page.needs_vision else "pdf_text",
        )
        for page, key in zip(result.pages, result.image_keys, strict=True)
    )
    session.add_all(
        Chunk(
            document_id=doc.id,
            user_id=doc.user_id,
            page_no=c.page_no,
            ordinal=c.ordinal,
            content=c.content,
            box=c.box,
            embedding=vector,
        )
        for c, vector in zip(result.chunks, result.vectors, strict=True)
    )

    ex = result.extraction
    doc.doc_type = ex.doc_type
    doc.title = ex.title.strip()[:120] or doc.title
    doc.tags = sorted({t.strip().lower() for t in ex.tags if t.strip()})[:5]
    for _, column in FIELDS.values():
        setattr(doc, column, result.fields.columns.get(column))
    doc.field_boxes = result.fields.boxes
    doc.confidence = result.fields.confidence
    doc.page_count = len(result.pages)
    doc.status = "needs_review" if needs_review(ex.doc_type, result.fields) else "ready"
    doc.error = None
    doc.processed_at = datetime.now(UTC)
