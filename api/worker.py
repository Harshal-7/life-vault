"""Background worker: picks queued jobs off Redis and processes documents.

    uv run arq worker.WorkerSettings

M0 stub: marks a document ready after a short pause. M1 replaces the body with the
real pipeline (read text → mask IDs → classify/extract → chunk → embed).
"""

import asyncio
import logging
import uuid

from sqlalchemy import select

from app.db.models import Document
from app.db.session import SessionLocal
from app.queue import redis_settings

log = logging.getLogger("worker")
READ_FAILED = "We couldn't read this file. Try a sharper photo or the original PDF."


async def process_document(ctx: dict, document_id: str) -> str:
    async with SessionLocal() as session:
        doc = await session.scalar(select(Document).where(Document.id == uuid.UUID(document_id)))
        if doc is None:
            return "missing"  # deleted before we got to it
        try:
            await asyncio.sleep(2)  # stand-in for OCR + extraction
            doc.status = "ready"
        except Exception as exc:  # pragma: no cover - real failures arrive with M1
            log.exception("processing failed for %s", document_id)
            doc.status, doc.error = "failed", READ_FAILED
            raise exc
        finally:
            await session.commit()
    return doc.status


class WorkerSettings:
    functions = [process_document]
    redis_settings = redis_settings()
    max_jobs = 5
    job_timeout = 300
