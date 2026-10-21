"""Background worker: picks queued jobs off Redis and reads documents.

    uv run arq worker.WorkerSettings

The pipeline itself lives in app/pipeline/run.py; this file only loads the document,
runs it, and records success or a friendly error the user can act on.
"""

import logging
import uuid

from sqlalchemy import select

from app.config import get_settings
from app.db.models import Document
from app.db.session import SessionLocal
from app.pipeline.read import ReadError
from app.pipeline.run import DocInput, read_document, save_result
from app.providers.embeddings import VoyageEmbedder
from app.providers.llm import get_reader, reader_configured
from app.queue import queue_name, redis_settings

log = logging.getLogger("worker")
READ_FAILED = "We couldn't read this file. Try again in a minute, or upload a clearer copy."
NOT_SET_UP = "Reading documents isn't set up on this server yet."


async def process_document(ctx: dict, document_id: str) -> str:
    async with SessionLocal() as session:
        doc = await session.scalar(select(Document).where(Document.id == uuid.UUID(document_id)))
        if doc is None:
            return "missing"  # deleted before we got to it
        job = DocInput(doc.id, doc.user_id, doc.file_key, doc.mime_type, doc.original_filename)
    # The session is closed while the AI and Voyage work (seconds to a minute), so a
    # slow document doesn't hold a database connection.

    settings = get_settings()
    error: str | None = None
    result = None
    if not (reader_configured() and settings.embeddings_api_key):
        log.error(
            "%s key or EMBEDDINGS_API_KEY not set; cannot read %s",
            settings.llm_provider,
            document_id,
        )
        error = NOT_SET_UP
    else:
        try:
            result = await read_document(job, ctx["reader"], ctx["embedder"])
        except ReadError as exc:
            error = str(exc)
        except Exception:
            # AI provider/Voyage/Storage outage or a bug. Mark it failed (the user gets a
            # Retry button) rather than letting arq retry blindly and spend money.
            log.exception("processing failed for %s", document_id)
            error = READ_FAILED

    async with SessionLocal() as session:
        doc = await session.scalar(select(Document).where(Document.id == job.id))
        if doc is None:
            return "missing"  # deleted while we were reading it
        if result is not None:
            await save_result(session, doc, result)
            log.info(
                "read %s by %s: %s, %d pages, %d chunks, status %s, timings %s",
                document_id,
                doc.read_by,
                doc.doc_type,
                doc.page_count,
                len(result.chunks),
                doc.status,
                result.timings,
            )
        else:
            doc.status, doc.error = "failed", error
        await session.commit()
        return doc.status


async def startup(ctx: dict) -> None:
    # One client each for the life of the worker, so connections are reused.
    ctx["reader"] = get_reader()  # Claude or Gemini, from LLM_PROVIDER
    ctx["embedder"] = VoyageEmbedder()


class WorkerSettings:
    functions = [process_document]
    on_startup = startup
    redis_settings = redis_settings()
    queue_name = queue_name()
    max_jobs = 5
    job_timeout = 300
    # How often an idle worker checks Redis for new jobs. arq's default (0.5 s) would
    # use up Upstash's free monthly command allowance in days; 5 s costs ~10x less and
    # documents take seconds to read anyway.
    poll_delay = 5
