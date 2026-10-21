"""Embeddings (text → 1024 numbers that capture meaning) and, with Voyage, reranking
(scoring passages against a question, more precisely than embeddings).

Picked by EMBEDDINGS_PROVIDER:
- gemini (default): free with the Gemini key. No reranker, so search ranks by the
  merged keyword + meaning lists and judges relevance by cosine similarity.
- voyage: voyage-3.5 + rerank-2.5-lite. Needs a payment method on Voyage's side for
  usable rate limits (tracker #41).

Both are multilingual, so "बिजली बिल" and "electricity bill" land close together.
Switching provider means re-embedding stored chunks: `python -m app.scripts.reembed`.
"""

import asyncio
from typing import Literal, Protocol

import httpx

from app.config import get_settings
from app.db.models import EMBEDDING_DIMS

API = "https://api.voyageai.com/v1"
BATCH = 128  # inputs per embeddings request (Voyage allows 1000; smaller = gentler)
GEMINI_BATCH = 100
ATTEMPTS = 4

InputType = Literal["document", "query"]


class EmbeddingsError(RuntimeError):
    pass


class Embedder(Protocol):
    provider: str
    can_rerank: bool
    # Relevance cutoffs on this embedder's scale (reranker score, or cosine similarity
    # without one): below `min_relevance` a passage doesn't count; a fact card on the
    # fast path needs `sure_relevance`. Tuned with the Ask eval (tracker #39).
    min_relevance: float
    sure_relevance: float

    async def embed(self, texts: list[str], input_type: InputType) -> list[list[float]]: ...
    async def rerank(
        self, query: str, documents: list[str], top_k: int
    ) -> list[tuple[int, float]]: ...


class VoyageEmbedder:
    provider = "voyage"
    can_rerank = True
    min_relevance = 0.3
    sure_relevance = 0.5

    def __init__(self):
        settings = get_settings()
        self.model = settings.embeddings_model
        self.rerank_model = settings.rerank_model
        self.headers = {"authorization": f"Bearer {settings.embeddings_api_key}"}
        self.tokens = 0

    async def _post(self, path: str, body: dict) -> dict:
        async with httpx.AsyncClient(base_url=API, headers=self.headers, timeout=60) as c:
            for attempt in range(ATTEMPTS):
                r = await c.post(path, json=body)
                if r.status_code != 429 and r.status_code < 500:
                    break
                if attempt < ATTEMPTS - 1:  # rate limited or a Voyage hiccup: wait, retry
                    await asyncio.sleep(_wait(r, attempt))
        if r.status_code != 200:
            raise EmbeddingsError(f"voyage {path} failed: {r.status_code} {r.text[:200]}")
        data = r.json()
        self.tokens += (data.get("usage") or {}).get("total_tokens", 0)
        return data

    async def embed(self, texts: list[str], input_type: InputType) -> list[list[float]]:
        """`input_type` matters: Voyage words questions and passages slightly
        differently so that a question lands near the passage that answers it."""
        vectors: list[list[float]] = []
        for start in range(0, len(texts), BATCH):
            batch = texts[start : start + BATCH]
            data = await self._post(
                "/embeddings", {"input": batch, "model": self.model, "input_type": input_type}
            )
            vectors.extend(item["embedding"] for item in sorted(data["data"], key=_index))
        return vectors

    async def rerank(self, query: str, documents: list[str], top_k: int) -> list[tuple[int, float]]:
        """Best `top_k` documents as (position in `documents`, relevance 0-1)."""
        if not documents:
            return []
        data = await self._post(
            "/rerank",
            {"query": query, "documents": documents, "model": self.rerank_model, "top_k": top_k},
        )
        return [(item["index"], item["relevance_score"]) for item in data["data"]]


class GeminiEmbedder:
    provider = "gemini"
    can_rerank = False
    # Cosine similarity of the question to a passage (gemini-embedding-001, 1024 dims).
    min_relevance = 0.62
    sure_relevance = 0.68

    def __init__(self, client=None):
        settings = get_settings()
        self.model = settings.gemini_embeddings_model
        self._client = client

    @property
    def client(self):
        if self._client is None:  # created on first use, like GeminiReader
            from app.providers.gemini import make_client

            self._client = make_client()
        return self._client

    async def embed(self, texts: list[str], input_type: InputType) -> list[list[float]]:
        from google.genai import types

        task = "RETRIEVAL_QUERY" if input_type == "query" else "RETRIEVAL_DOCUMENT"
        vectors: list[list[float]] = []
        for start in range(0, len(texts), GEMINI_BATCH):
            response = await self.client.aio.models.embed_content(
                model=self.model,
                contents=texts[start : start + GEMINI_BATCH],
                config=types.EmbedContentConfig(
                    task_type=task, output_dimensionality=EMBEDDING_DIMS
                ),
            )
            vectors.extend(e.values for e in response.embeddings)
        if len(vectors) != len(texts):
            raise EmbeddingsError(f"gemini returned {len(vectors)} embeddings for {len(texts)}")
        return vectors

    async def rerank(self, query: str, documents: list[str], top_k: int) -> list[tuple[int, float]]:
        raise NotImplementedError("Gemini has no reranker; search ranks without one")


def get_embedder() -> Embedder:
    if get_settings().embeddings_provider == "voyage":
        return VoyageEmbedder()
    return GeminiEmbedder()


def embeddings_configured() -> bool:
    settings = get_settings()
    if settings.embeddings_provider == "voyage":
        return bool(settings.embeddings_api_key)
    return bool(settings.gemini_api_key)


def _index(item: dict) -> int:
    return item["index"]


def _wait(response: httpx.Response, attempt: int) -> float:
    """Seconds before retrying: Voyage's Retry-After if it sends one, else 2, 4, 8 s
    (rate limits get longer waits: 5, 10, 20 s, since limits reset per minute)."""
    try:
        return min(float(response.headers["retry-after"]), 30.0)
    except (KeyError, ValueError):
        base = 5 if response.status_code == 429 else 2
        return base * 2**attempt
