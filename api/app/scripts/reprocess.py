"""Read documents again with the current pipeline, e.g. so page images saved before
ID numbers were blurred get blurred too. Queues the same job as the Retry button,
so a worker must be running; each document costs AI calls, and fields the user
corrected by hand are replaced by what the AI reads this time.

Dry run (lists what would be queued):
    uv run python -m app.scripts.reprocess [--user <user id>]
Queue them:
    uv run python -m app.scripts.reprocess [--user <user id>] --yes
"""

import argparse
import asyncio
import uuid

from sqlalchemy import select

from app.config import get_settings
from app.db.models import Document
from app.db.session import SessionLocal, engine
from app.queue import close_pool, get_pool, queue_name

# Only finished documents: "uploaded" never arrived, "processing" is already queued.
DONE = ("ready", "needs_review", "failed")


async def main(user_id: uuid.UUID | None, yes: bool) -> None:
    stmt = select(Document).where(Document.status.in_(DONE)).order_by(Document.created_at)
    if user_id:
        stmt = stmt.where(Document.user_id == user_id)
    queued = skipped = 0
    async with SessionLocal() as session:
        docs = (await session.scalars(stmt)).all()
        pool = await get_pool() if yes else None
        if yes and pool is None:
            raise SystemExit("REDIS_URL not set: nothing to queue on")
        for doc in docs:
            if not yes:
                print(f"would queue {doc.id} ({doc.status}) {doc.original_filename}")
                continue
            # Mark it first (the worker could finish before we'd get to it), and put
            # it back if arq says this job id is still queued or recently done.
            before = doc.status, doc.error
            doc.status, doc.error = "processing", None
            await session.commit()
            job = await pool.enqueue_job(
                "process_document",
                str(doc.id),
                _job_id=f"process:{doc.id}",
                _queue_name=queue_name(),
            )
            if job is None:
                doc.status, doc.error = before
                await session.commit()
                skipped += 1
            else:
                queued += 1
    await close_pool()
    await engine.dispose()
    env = get_settings().env
    if yes:
        print(f"queued {queued}, skipped {skipped} (job still in arq) ({env})")
    else:
        print(f"{len(docs)} documents would be queued ({env}); add --yes to queue them")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Re-read documents with the current pipeline.")
    parser.add_argument("--user", type=uuid.UUID, help="only this user's documents")
    parser.add_argument("--yes", action="store_true", help="queue them (default: dry run)")
    args = parser.parse_args()
    asyncio.run(main(args.user, args.yes))
