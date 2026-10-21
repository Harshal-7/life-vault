"""Ask eval: how well questions get answered from a vault.

    uv run python -m evals.ask                    # every provider that has a key
    uv run python -m evals.ask --provider gemini
    uv run python -m evals.ask --only "rent"      # questions containing this text

Builds the fictional vault from evals/cases.py with the real reading pipeline
(AI + Voyage), inside a dev-database transaction that is always rolled back under a
throwaway user, so nothing is left behind and no storage is used. Then asks every
question in evals/ask_cases.py through the real Ask service and scores it.
"""

import argparse
import asyncio
import json
import statistics
import time
import uuid
from datetime import date
from pathlib import Path

from sqlalchemy import pool, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.ask.retrieve import search
from app.ask.service import ask
from app.ask.vault import load_vault
from app.config import get_settings
from app.db.models import Document, User
from app.db.session import async_database_url
from app.pipeline.chunk import chunk_pages, embedding_header
from app.pipeline.fields import build_fields
from app.pipeline.read import Box, Line, Page, read_file
from app.pipeline.run import ReadResult, read_by_label, save_result, understand
from app.providers import storage
from app.providers.embeddings import get_embedder
from app.providers.llm import Extraction
from evals.ask_cases import QUESTIONS, TODAY, Q
from evals.cases import CASES
from evals.extract import make_file, readers

RESULTS = Path(__file__).parent / "results"


def norm(s: str) -> str:
    return " ".join(s.casefold().replace("rs.", "₹").replace(",", "").split())


CACHE = Path(__file__).parent / ".cache"  # git-ignored


def _cache_path(reader, embedder) -> Path:
    return CACHE / f"vault-{reader.provider}-{reader.fast_model}-{embedder.provider}.json"


def _dump_pages(pages: list[Page]) -> list[dict]:
    return [
        {
            "n": p.page_no,
            "w": p.width,
            "h": p.height,
            "vision": p.needs_vision,
            "lines": [[ln.text, ln.box.x, ln.box.y, ln.box.w, ln.box.h] for ln in p.lines],
        }
        for p in pages
    ]


def _load_pages(data: list[dict]) -> list[Page]:
    return [
        Page(
            p["n"],
            b"",
            p["w"],
            p["h"],
            [Line(t, Box(x, y, w, h)) for t, x, y, w, h in p["lines"]],
            b"jpeg" if p["vision"] else None,
        )
        for p in data
    ]


async def read_case(case, reader, embedder, cache: dict, fresh: bool):
    """The AI reading of one case, from the cache when we have it: re-reading the same
    12 documents on every run would burn free-tier quota for no new information."""
    data, mime = make_file(case)
    hit = None if fresh else cache.get(case.id)
    if hit:
        pages = _load_pages(hit["pages"])
        extraction = Extraction.model_validate(hit["extraction"])
        fields = build_fields(extraction, pages)
        chunks, vectors = chunk_pages(pages), hit["vectors"]
        return data, mime, pages, extraction, fields, chunks, vectors
    pages = read_file(data, mime, get_settings().max_pages)
    extraction, fields = await understand(pages, reader, f"{case.id}.{case.kind}")
    chunks = chunk_pages(pages)
    header = embedding_header(extraction.doc_type, extraction.title, fields.columns.get("vendor"))
    vectors = await embedder.embed([header + c.content for c in chunks], "document")
    cache[case.id] = {
        "pages": _dump_pages(pages),
        "extraction": extraction.model_dump(),
        "vectors": vectors,
    }
    return data, mime, pages, extraction, fields, chunks, vectors


async def build_vault(
    session: AsyncSession, user_id: uuid.UUID, reader, embedder, fresh: bool = False
) -> dict:
    """Read every fictional case into the (rolled-back) database. Returns case id → doc id."""
    path = _cache_path(reader, embedder)
    cache = {} if fresh or not path.exists() else json.loads(path.read_text())
    ids = {}
    for case in CASES:
        data, mime, pages, extraction, fields, chunks, vectors = await read_case(
            case, reader, embedder, cache, fresh
        )
        doc = Document(
            user_id=user_id,
            file_key=f"eval/{case.id}",
            original_filename=f"{case.id}.{case.kind}",
            mime_type=mime,
            size_bytes=len(data),
            status="processing",
        )
        session.add(doc)
        await session.flush()
        keys = [f"eval/{case.id}/pages/{p.page_no}.webp" for p in pages]
        result = ReadResult(
            pages, extraction, fields, chunks, vectors, keys, read_by_label(reader, pages)
        )
        await save_result(session, doc, result)
        await session.flush()
        ids[case.id] = doc.id
        print("v", end="", flush=True)
    CACHE.mkdir(exist_ok=True)
    path.write_text(json.dumps(cache))
    return ids


async def run_question(session, user_id, q: Q, reader, embedder, doc_case: dict) -> dict:
    # Search on its own first (embeddings only, no AI call): the best match's score,
    # so relevance cutoffs can be set from real numbers (tracker #39).
    titles = {d.id: d.title for d in await load_vault(session, user_id)}
    hits = await search(session, user_id, embedder, q.q, q.q, titles)
    top = hits[0] if hits else None
    top_relevance = top.relevance if top else 0.0
    top_right = bool(top and doc_case.get(top.document_id) in q.docs)

    started = time.perf_counter()
    first_event = first_word = None
    events = []
    async for event in ask(
        session, user_id, q.q, reader, embedder, today=date.fromisoformat(TODAY)
    ):
        now = round(time.perf_counter() - started, 2)
        first_event = first_event or now
        if event["type"] == "delta":
            first_word = first_word or now
        events.append(event)
    total = round(time.perf_counter() - started, 2)

    route = next(e["route"] for e in events if e["type"] == "route")
    fact = next((e for e in events if e["type"] == "fact"), None)
    citations = next((e["citations"] for e in events if e["type"] == "sources"), [])
    answer = "".join(e["text"] for e in events if e["type"] == "delta")
    not_found = any(e["type"] == "not_found" for e in events)
    errored = any(e["type"] == "error" for e in events)

    cited = [doc_case.get(uuid.UUID(c["documentId"])) for c in citations]
    rank = next((i for i, c in enumerate(cited, 1) if c in q.docs), None)
    said = norm(f"{fact['value'] if fact else ''} {answer}")
    return {
        "q": q.q,
        "kind": q.kind,
        "route": route,
        "fact": fact and fact["value"],
        "answer": answer,
        "cited": cited,
        "not_found": not_found,
        "error": errored,
        "hit": rank is not None if q.docs else None,
        "rr": (1 / rank if rank else 0.0) if q.docs else None,
        "fact_ok": (fact is not None and fact["value"] == q.fact) if q.fact else None,
        "text_ok": all(norm(t) in said for t in q.text) if q.text else None,
        "not_found_ok": not_found == q.not_found,
        "first_event": first_event,
        "first_word": first_word,
        "total": total,
        "top_relevance": top_relevance,
        "top_right": top_right,
    }


def pct(values: list[bool]) -> str:
    return f"{sum(values)}/{len(values)} ({sum(values) / len(values):.0%})" if values else "-"


def p(values: list[float], q: float) -> float:
    values = sorted(v for v in values if v is not None)
    if not values:
        return 0.0
    return round(
        statistics.quantiles(values, n=100)[int(q) - 1] if len(values) > 1 else values[0], 1
    )


def report(provider: str, reader, results: list[dict], cutoffs: str = "") -> dict:
    answerable = [r for r in results if r["hit"] is not None]
    missing = [r for r in results if r["kind"] == "missing"]
    print(
        f"\n=== Ask · {provider}: {reader.fast_model} / {reader.smart_model}"
        f" · search: {get_settings().embeddings_provider} ==="
    )

    def scored(key):
        return [r[key] for r in results if r[key] is not None]

    print(f"Right answer (expected text):  {pct(scored('text_ok'))}")
    print(f"Fact card right:               {pct(scored('fact_ok'))}")
    print(
        f"Right document in sources:     {pct([r['hit'] for r in answerable])}"
        f"   MRR {statistics.mean(r['rr'] for r in answerable):.2f}"
    )
    print(f"'Not found' when it isn't there: {pct([r['not_found'] for r in missing])}")
    print(f"Wrongly 'not found':           {sum(r['not_found'] for r in answerable)}")
    by_kind = {}
    for r in results:
        if r["text_ok"] is not None:
            by_kind.setdefault(r["kind"], []).append(r["text_ok"])
    print("By kind:", ", ".join(f"{k} {pct(v)}" for k, v in by_kind.items()))
    fast = [r for r in results if r["kind"] == "date"]
    slow = [r for r in results if r["kind"] != "date"]
    for name, group in (("dates (fast path)", fast), ("everything else", slow)):
        print(
            f"Time {name}: first event p50 {p([r['first_event'] for r in group], 50)} s,"
            f" first word p50 {p([r['first_word'] for r in group], 50)} s"
            f" / p95 {p([r['first_word'] for r in group], 95)} s"
        )
    right = sorted(r["top_relevance"] for r in answerable if r["top_right"])
    absent = sorted(r["top_relevance"] for r in missing)
    if right and absent:
        print(
            f"Top match score, right document: min {right[0]:.3f}, median "
            f"{statistics.median(right):.3f} · not in vault: max {absent[-1]:.3f}"
            f" (cutoffs now {cutoffs})"
        )
    print(
        f"Tokens: {reader.usage.input_tokens:,} in / {reader.usage.output_tokens:,} out"
        f" (vault reading included unless cached)"
    )
    for r in results:
        bad = [k for k in ("text_ok", "fact_ok", "not_found_ok") if r[k] is False]
        if bad or r["error"]:
            print(
                f"  ✗ {r['q']}  [{', '.join(bad) or 'error'}]  route={r['route']}"
                f" fact={r['fact']!r} cited={r['cited'][:3]} answer={r['answer'][:140]!r}"
            )
    return {
        "provider": provider,
        "models": [reader.fast_model, reader.smart_model],
        "embeddings": get_settings().embeddings_provider,
        "date": str(date.today()),
        "usage": reader.usage.by_model,
        "questions": results,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--provider", choices=["gemini", "claude", "both"], default="both")
    parser.add_argument("--only", help="ask only questions containing this text")
    parser.add_argument("--fresh", action="store_true", help="re-read the vault (no cache)")
    parser.add_argument(
        "--pace",
        type=float,
        default=8.5,
        help="seconds between questions (Gemini free tier: 15 requests/min per model)",
    )
    args = parser.parse_args()
    questions = [q for q in QUESTIONS if not args.only or args.only.casefold() in q.q.casefold()]

    async def no_urls(keys, expires_in=600):
        return {}  # eval pages aren't in Storage

    storage.signed_urls = no_urls
    embedder = get_embedder()  # EMBEDDINGS_PROVIDER: gemini (default) or voyage
    RESULTS.mkdir(exist_ok=True)

    for provider, reader in readers(args.provider):
        engine = create_async_engine(
            async_database_url(get_settings().database_url), poolclass=pool.NullPool
        )
        async with engine.connect() as conn:
            trans = await conn.begin()
            session = AsyncSession(
                bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False
            )
            try:
                user_id = uuid.uuid4()
                await session.execute(
                    text(
                        "insert into auth.users (id, email, aud, role) "
                        "values (:id, :email, 'authenticated', 'authenticated')"
                    ),
                    {"id": user_id, "email": f"eval-{user_id}@example.invalid"},
                )
                session.add(User(id=user_id, email=f"eval-{user_id}@example.invalid"))
                await session.flush()
                ids = await build_vault(session, user_id, reader, embedder, args.fresh)
                doc_case = {v: k for k, v in ids.items()}
                results = []
                for q in questions:
                    results.append(
                        await run_question(session, user_id, q, reader, embedder, doc_case)
                    )
                    print(".", end="", flush=True)
                    await asyncio.sleep(args.pace)  # stay under free-tier per-minute limits
            finally:
                await session.close()
                await trans.rollback()  # leave nothing behind
        await engine.dispose()
        cutoffs = f"{embedder.min_relevance} / {embedder.sure_relevance}"
        summary = report(provider, reader, results, cutoffs)
        if not args.only:
            path = RESULTS / f"ask-{provider}-{date.today()}.json"
            path.write_text(json.dumps(summary, indent=2, default=str, ensure_ascii=False))
            print(f"Saved {path}")


if __name__ == "__main__":
    asyncio.run(main())
