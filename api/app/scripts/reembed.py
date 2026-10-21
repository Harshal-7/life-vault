"""Re-embed every stored chunk with the current EMBEDDINGS_PROVIDER. Run this after
switching providers: vectors from different providers can't be compared, so search
would quietly go wrong until it's done. No AI reading needed; safe to run again.

uv run python -m app.scripts.reembed
"""

import asyncio

from sqlalchemy import select

from app.config import get_settings
from app.db.models import Chunk, Document
from app.db.session import SessionLocal, engine
from app.pipeline.chunk import embedding_header
from app.providers.embeddings import get_embedder


async def main() -> None:
    embedder = get_embedder()
    done = 0
    async with SessionLocal() as session:
        docs = (await session.scalars(select(Document).where(Document.page_count > 0))).all()
        for doc in docs:
            chunks = (
                await session.scalars(
                    select(Chunk).where(Chunk.document_id == doc.id).order_by(Chunk.ordinal)
                )
            ).all()
            if not chunks:
                continue
            header = embedding_header(doc.doc_type or "other", doc.title or "", doc.vendor)
            vectors = await embedder.embed([header + c.content for c in chunks], "document")
            for chunk, vector in zip(chunks, vectors, strict=True):
                chunk.embedding = vector
            await session.commit()  # one document at a time: safe to stop and rerun
            done += len(chunks)
    await engine.dispose()
    print(
        f"re-embedded {done} chunks in {len(docs)} documents with {embedder.provider}"
        f" ({get_settings().env})"
    )


if __name__ == "__main__":
    asyncio.run(main())
