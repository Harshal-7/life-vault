"""Hybrid search over the person's chunks: meaning (pgvector) + words (Postgres
keyword index), merged with Reciprocal Rank Fusion. With Voyage, a reranker then reads
question and passage together and re-sorts them (more precise than either list).
Without one (Gemini embeddings), the fused order stands and a passage's relevance is
its cosine similarity to the question.

Every query filters by user_id: one person's passages can never reach another's answer.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import Float, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.ask.rules import keyword_terms
from app.db.models import Chunk
from app.providers.embeddings import Embedder

PER_LIST = 20  # candidates from each search
RERANK_POOL = 30  # how many fused candidates the reranker reads
RRF_K = 60  # standard constant: dampens the gap between rank 1 and rank 2


@dataclass
class Hit:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    page_no: int
    content: str
    box: dict | None
    relevance: float = 0.0  # reranker score, 0-1


def rrf(*rankings: list[uuid.UUID]) -> list[uuid.UUID]:
    """Reciprocal Rank Fusion: score = Σ 1/(k + rank). Items high in several lists win;
    no need to compare cosine distances with keyword ranks directly."""
    scores: dict[uuid.UUID, float] = {}
    for ranking in rankings:
        for rank, item in enumerate(ranking, start=1):
            scores[item] = scores.get(item, 0.0) + 1.0 / (RRF_K + rank)
    return sorted(scores, key=lambda i: scores[i], reverse=True)


async def search(
    session: AsyncSession,
    user_id: uuid.UUID,
    embedder: Embedder,
    query: str,
    question: str,
    titles: dict[uuid.UUID, str],
    top_k: int = 5,
) -> list[Hit]:
    """`query` is what we search with (the router's English rewrite when there is one,
    else the question; Voyage is multilingual either way); `question` is what the
    reranker judges against. `titles` labels each passage for the reranker."""
    [vector] = await embedder.embed([query], "query")
    # Cosine distance (= 1 - similarity). return_type: the result is a number, not a vector.
    distance = Chunk.embedding.op("<=>", return_type=Float)(vector)
    cols = (
        Chunk.id,
        Chunk.document_id,
        Chunk.page_no,
        Chunk.content,
        Chunk.box,
        distance.label("distance"),
    )
    mine = Chunk.user_id == user_id

    # With a filter, an HNSW index may stop early and return too few rows; this lets
    # it keep scanning until it has enough matching ones (pgvector 0.8).
    await session.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
    by_meaning = (
        await session.execute(select(*cols).where(mine).order_by(distance).limit(PER_LIST))
    ).all()

    by_words = []
    terms = keyword_terms(f"{query} {question}")
    if terms:
        tsquery = func.to_tsquery("simple", " | ".join(terms))
        by_words = (
            await session.execute(
                select(*cols)
                .where(mine, Chunk.tsv.op("@@")(tsquery))
                .order_by(func.ts_rank_cd(Chunk.tsv, tsquery).desc())
                .limit(PER_LIST)
            )
        ).all()

    rows = {r.id: r for r in [*by_meaning, *by_words]}
    pool = rrf([r.id for r in by_meaning], [r.id for r in by_words])[:RERANK_POOL]
    if not pool:
        return []
    if not embedder.can_rerank:
        return [
            Hit(r.id, r.document_id, r.page_no, r.content, r.box, round(1 - r.distance, 3))
            for i in pool[:top_k]
            for r in [rows[i]]
        ]
    passages = [f"{titles.get(rows[i].document_id, '')}\n{rows[i].content}" for i in pool]
    ranked = await embedder.rerank(question, passages, top_k=min(top_k, len(pool)))
    return [
        Hit(r.id, r.document_id, r.page_no, r.content, r.box, round(score, 3))
        for index, score in ranked
        for r in [rows[pool[index]]]
    ]
