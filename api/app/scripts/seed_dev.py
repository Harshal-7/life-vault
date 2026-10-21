"""Fill a dev account with the 12 fictional eval documents, so real (non-demo) screens
can be tested without uploading anything personal. Dev only: refuses to run when
ENV=prod.

    uv run python -m app.scripts.seed_dev --email you@example.com          # dry run
    uv run python -m app.scripts.seed_dev --email you@example.com --yes    # add + queue

The worker (`uv run arq worker.WorkerSettings`) then reads them like real uploads,
which uses AI calls (about one or two per document). Documents already added (same
file hash) are skipped, so it's safe to run again.
"""

import argparse
import asyncio
import hashlib
import uuid

from sqlalchemy import select

from app.config import get_settings
from app.db.models import Document, User
from app.db.session import SessionLocal, engine
from app.providers import storage
from app.queue import enqueue_processing
from app.routes.documents import guess_type, pretty_title, safe_filename
from evals.cases import CASES
from evals.extract import make_file


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--email", required=True, help="the account to fill (must have signed in once)"
    )
    parser.add_argument("--yes", action="store_true", help="actually add and queue them")
    args = parser.parse_args()
    if get_settings().env == "prod":
        raise SystemExit("seed_dev only runs against a dev database (ENV=prod is set).")

    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == args.email.lower()))
        if user is None:
            raise SystemExit(f"No user {args.email}: sign in once on the dev site first.")
        queued = []
        for case in CASES:
            data, mime = make_file(case)
            filename = f"{case.id}.{'pdf' if case.kind == 'pdf' else 'jpg'}"
            sha = hashlib.sha256(data).hexdigest()
            exists = await session.scalar(
                select(Document.id).where(Document.user_id == user.id, Document.sha256 == sha)
            )
            if exists:
                print(f"skip   {filename} (already added)")
                continue
            print(f"{'add' if args.yes else 'would add'}    {filename}")
            if not args.yes:
                continue
            doc_id = uuid.uuid4()
            doc = Document(
                id=doc_id,
                user_id=user.id,
                file_key=f"{user.id}/{doc_id}/{safe_filename(filename)}",
                original_filename=filename,
                mime_type=mime,
                size_bytes=len(data),
                sha256=sha,
                source="camera" if case.kind == "photo" else "upload",
                status="processing",
                doc_type=guess_type(filename),
                title=pretty_title(filename),
            )
            await storage.upload(doc.file_key, data, mime)
            session.add(doc)
            await session.commit()
            queued.append(doc_id)
        for doc_id in queued:
            await enqueue_processing(doc_id)
    await engine.dispose()
    print(f"queued {len(queued)} documents" if args.yes else "dry run: add --yes to add them")


if __name__ == "__main__":
    asyncio.run(main())
