"""Voyage AI over plain HTTP: embeddings (text → 1024 numbers that capture meaning)
and reranking (score passages against a question, more precisely than embeddings).

voyage-3.5 is multilingual, so "बिजली बिल" and "electricity bill" land close together.
"""

import asyncio
from typing import Literal, Protocol

import httpx

from app.config import get_settings

API = "https://api.voyageai.com/v1"
BATCH = 128  # inputs per embeddings request (Voyage allows 1000; smaller = gentler)
ATTEMPTS = 4

InputType = Literal["document", "query"]


class EmbeddingsError(RuntimeError):
    pass


class Embedder(Protocol):
    async def embed(self, texts: list[str], input_type: InputType) -> list[list[float]]: ...
    async def rerank(
        self, query: str, documents: list[str], top_k: int
    ) -> list[tuple[int, float]]: ...


class VoyageEmbedder:
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
