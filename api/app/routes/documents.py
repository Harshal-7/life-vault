"""Documents: upload (two steps), list, view, rename, delete, retry.

Upload flow, so files never pass through this server:
1. POST /documents             → creates the row (status "uploaded") + a one-time upload URL
2. browser PUTs the file to Supabase Storage with that URL
3. POST /documents/{id}/complete → checks the file arrived, marks "processing", queues it

Every query filters by the signed-in user's id: one user can never see another's rows.
"""

import re
import uuid

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import or_, select

from app.auth import CurrentUser, DbSession
from app.db.models import Document
from app.providers import storage
from app.queue import enqueue_processing
from app.schemas import DocType, DocumentDetailOut, DocumentOut, DocumentPatch, UploadIn, UploadOut

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
    # HEIC photos can't be shown by most browsers until M1 converts them.
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
        thumbnail_url=thumbnail_url,
        created_at=doc.created_at,
        error=doc.error,
    )


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

    # Photos can be their own thumbnails; PDFs get page images in M1.
    image_keys = [d.file_key for d in docs if _browser_image(d.mime_type)]
    thumbs = await storage.signed_urls(image_keys) if image_keys else {}
    return [to_out(d, thumbs.get(d.file_key)) for d in docs]


@router.get("/{document_id}", response_model=DocumentDetailOut)
async def get_document(document_id: uuid.UUID, user: CurrentUser, session: DbSession):
    doc = await _owned(session, user, document_id)
    urls = await storage.signed_urls([doc.file_key])
    file_url = urls.get(doc.file_key)
    base = to_out(doc, file_url if doc.mime_type.startswith("image/") else None)
    return DocumentDetailOut(**base.model_dump(), file_url=file_url)


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
    await storage.delete_objects([doc.file_key])  # file first: never leave an orphaned file behind
    await session.delete(doc)
    await session.commit()
