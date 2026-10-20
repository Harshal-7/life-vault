"""Documents: upload (two steps), list, view, rename, delete, retry.

Upload flow, so files never pass through this server:
1. POST /documents             → creates the row (status "uploaded") + a one-time upload URL
2. browser PUTs the file to Supabase Storage with that URL
3. POST /documents/{id}/complete → checks the file arrived, marks "processing", queues it

Every query filters by the signed-in user's id: one user can never see another's rows.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select

from app.auth import CurrentUser, DbSession
from app.config import get_settings
from app.db.models import Document, DocumentPage
from app.pipeline.fields import FIELDS
from app.providers import storage
from app.queue import enqueue_processing
from app.schemas import (
    DocType,
    DocumentDetailOut,
    DocumentOut,
    DocumentPatch,
    FieldsPatch,
    PageOut,
    UploadIn,
    UploadOut,
)

router = APIRouter(prefix="/documents", tags=["documents"])

_TYPE_RULES: list[tuple[str, str]] = [
    (r"warrant", "warranty"),
    (r"insur|policy", "insurance"),
    (r"rent|lease|agreement", "rent"),
    (r"electric|bill|broadband|water|gas", "bill"),
    (r"receipt|invoice|memo", "receipt"),
    (r"pharma|rx|prescription|medic|lab|report", "medical"),
    (r"tax|itr|form ?16", "tax"),
    (r"manual|guide", "manual"),
    (r"\bpan\b|aadhaar|passport|licen[cs]e|voter", "id"),
]


def guess_type(filename: str) -> DocType:
    """A first guess from the file name; the M1 pipeline classifies properly."""
    name = filename.lower()
    return next((t for pattern, t in _TYPE_RULES if re.search(pattern, name)), "other")  # type: ignore[return-value]


def pretty_title(filename: str) -> str:
    base = re.sub(r"[_-]+", " ", re.sub(r"\.[a-z0-9]+$", "", filename, flags=re.I)).strip()
    if re.match(r"^(img\s?\d+|scan|\d+$)", base, re.I) or not base:
        return "New scan"
    return base[0].upper() + base[1:]


def safe_filename(filename: str) -> str:
    """Keep storage keys boring: letters, digits, dot, dash, underscore."""
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip("-.") or "file"
    return name[-120:]


def _browser_image(mime: str) -> bool:
    # Most browsers can't show HEIC; those get a thumbnail once the page image exists.
    return mime.startswith("image/") and mime not in ("image/heic", "image/heif")


def to_out(doc: Document, thumbnail_url: str | None = None) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        title=doc.title or pretty_title(doc.original_filename),
        doc_type=doc.doc_type or "other",
        status=doc.status,
        source=doc.source,
        original_filename=doc.original_filename,
        size_bytes=doc.size_bytes,
        mime_type=doc.mime_type,
        page_count=doc.page_count or 0,
        thumbnail_url=thumbnail_url,
        tags=doc.tags or [],
        vendor=doc.vendor,
        amount=float(doc.amount) if doc.amount is not None else None,
        doc_date=doc.doc_date,
        expiry_date=doc.expiry_date or doc.due_date,
        created_at=doc.created_at,
        error=doc.error,
    )


def field_values(doc: Document) -> dict:
    """The extracted fields under the UI's names, leaving out empty ones."""
    out = {}
    for key, column in FIELDS.values():
        value = getattr(doc, column)
        if value is None:
            continue
        out[key] = float(value) if isinstance(value, Decimal) else value
    return out


async def _page_keys(session: DbSession, doc_ids: list[uuid.UUID], first_only=False) -> dict:
    """{document id: [page image keys in order]}"""
    stmt = select(
        DocumentPage.document_id, DocumentPage.image_key, DocumentPage.width, DocumentPage.height
    ).where(DocumentPage.document_id.in_(doc_ids))
    if first_only:
        stmt = stmt.where(DocumentPage.page_no == 1)
    out: dict[uuid.UUID, list] = {}
    for row in await session.execute(stmt.order_by(DocumentPage.page_no)):
        out.setdefault(row.document_id, []).append(row)
    return out


async def _owned(session: DbSession, user: CurrentUser, document_id: uuid.UUID) -> Document:
    doc = await session.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == user.id)
    )
    if doc is None:
        # Same answer whether it doesn't exist or belongs to someone else.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return doc


@router.post("", response_model=UploadOut, status_code=status.HTTP_201_CREATED)
async def start_upload(body: UploadIn, user: CurrentUser, session: DbSession):
    limit = get_settings().daily_document_limit
    added_today = await session.scalar(
        select(func.count()).where(
            Document.user_id == user.id,
            Document.created_at > datetime.now(UTC) - timedelta(days=1),
        )
    )
    if added_today >= limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"You've added {limit} documents in the last 24 hours. Try again tomorrow.",
        )
    if body.mime_type not in storage.ALLOWED_MIME_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PDFs and photos can be added."
        )
    if body.size_bytes > storage.MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Files must be 20 MB or smaller.")

    existing = await session.scalar(
        select(Document).where(
            Document.user_id == user.id,
            Document.sha256 == body.sha256,
            Document.status != "uploaded",  # an abandoned upload doesn't count
        )
    )
    if existing is not None:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": "duplicate",
                "existing": to_out(existing).model_dump(mode="json", by_alias=True),
            },
        )

    doc_id = uuid.uuid4()
    doc = Document(
        id=doc_id,
        user_id=user.id,
        file_key=f"{user.id}/{doc_id}/{safe_filename(body.filename)}",
        original_filename=body.filename,
        mime_type=body.mime_type,
        size_bytes=body.size_bytes,
        sha256=body.sha256,
        source=body.source,
        status="uploaded",
        doc_type=guess_type(body.filename),
        title=pretty_title(body.filename),
    )
    session.add(doc)
    await session.flush()
    upload_url = await storage.create_upload_url(doc.file_key)
    await session.commit()
    await session.refresh(doc)
    return UploadOut(document=to_out(doc), upload_url=upload_url)


@router.post("/{document_id}/complete", response_model=DocumentOut)
async def complete_upload(document_id: uuid.UUID, user: CurrentUser, session: DbSession):
    doc = await _owned(session, user, document_id)
    if doc.status != "uploaded":
        return to_out(doc)  # already completed; safe to call twice
    if await storage.object_size(doc.file_key) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file hasn't finished uploading.")
    doc.status = "processing"
    await session.commit()
    await session.refresh(doc)
    await enqueue_processing(doc.id)
    return to_out(doc)


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    user: CurrentUser, session: DbSession, q: str | None = None, type: DocType | None = None
):
    stmt = select(Document).where(Document.user_id == user.id, Document.status != "uploaded")
    if type:
        stmt = stmt.where(Document.doc_type == type)
    for word in (q or "").split():
        like = f"%{word}%"
        stmt = stmt.where(or_(Document.title.ilike(like), Document.original_filename.ilike(like)))
    docs = list(await session.scalars(stmt.order_by(Document.created_at.desc()).limit(500)))

    # Thumbnail: the first page image once it's been read; until then a photo can
    # stand in for itself.
    first_pages = await _page_keys(session, [d.id for d in docs], first_only=True)
    thumb_key = {
        d.id: first_pages[d.id][0].image_key if d.id in first_pages else d.file_key
        for d in docs
        if d.id in first_pages or _browser_image(d.mime_type)
    }
    urls = await storage.signed_urls(list(thumb_key.values())) if thumb_key else {}
    return [to_out(d, urls.get(thumb_key.get(d.id, ""))) for d in docs]


@router.get("/{document_id}", response_model=DocumentDetailOut)
async def get_document(document_id: uuid.UUID, user: CurrentUser, session: DbSession):
    doc = await _owned(session, user, document_id)
    pages = (await _page_keys(session, [doc.id])).get(doc.id, [])
    urls = await storage.signed_urls([doc.file_key] + [p.image_key for p in pages])
    file_url = urls.get(doc.file_key)
    page_out = [
        PageOut(url=urls[p.image_key], width=p.width, height=p.height)
        for p in pages
        if p.image_key in urls
    ]
    photo = file_url if _browser_image(doc.mime_type) else None
    base = to_out(doc, page_out[0].url if page_out else photo)
    return DocumentDetailOut(
        **base.model_dump(),
        fields=field_values(doc),
        field_boxes=doc.field_boxes or {},
        confidence=doc.confidence or {},
        pages=page_out,
        file_url=file_url,
    )


@router.patch("/{document_id}", response_model=DocumentOut)
async def update_document(
    document_id: uuid.UUID, body: DocumentPatch, user: CurrentUser, session: DbSession
):
    doc = await _owned(session, user, document_id)
    if body.title is not None:
        doc.title = body.title.strip()
    if body.doc_type is not None:
        doc.doc_type = body.doc_type
    await session.commit()
    await session.refresh(doc)
    return to_out(doc)


@router.patch("/{document_id}/fields", response_model=DocumentOut)
async def update_fields(
    document_id: uuid.UUID, body: FieldsPatch, user: CurrentUser, session: DbSession
):
    doc = await _owned(session, user, document_id)
    if doc.status not in ("needs_review", "ready"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This document is still being read.")
    sent = body.fields.model_dump(include=body.fields.model_fields_set, by_alias=True)
    columns = {key: column for key, column in FIELDS.values()}
    confidence = dict(doc.confidence or {})
    for key, value in sent.items():
        if value is None:
            continue  # empty boxes mean "leave as is", like the UI's draft does
        setattr(doc, columns[key], Decimal(str(value)) if key == "amount" else value)
        confidence[key] = 1.0  # a person checked it
    doc.confidence = confidence
    if body.confirm and doc.status == "needs_review":
        doc.status = "ready"
    await session.commit()
    await session.refresh(doc)
    return to_out(doc)


@router.post("/{document_id}/retry", response_model=DocumentOut)
async def retry_document(document_id: uuid.UUID, user: CurrentUser, session: DbSession):
    doc = await _owned(session, user, document_id)
    if doc.status != "failed":
        return to_out(doc)
    doc.status, doc.error = "processing", None
    await session.commit()
    await session.refresh(doc)
    await enqueue_processing(doc.id)
    return to_out(doc)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: uuid.UUID, user: CurrentUser, session: DbSession):
    doc = await _owned(session, user, document_id)
    pages = (await _page_keys(session, [doc.id])).get(doc.id, [])
    # Files first: never leave an orphaned file behind.
    await storage.delete_objects([doc.file_key] + [p.image_key for p in pages])
    await session.delete(doc)
    await session.commit()
