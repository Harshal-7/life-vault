"""One question, start to finish, as a stream of the events the web app renders
(web/src/lib/data/types.ts `AskEvent`):

    route → fact? → sources → delta… → done       or      route → not_found → done

Speed: search (~1 s) always runs; the AI router (~5 s on Gemini's free tier) runs only
when the fast-path rules can't tell which field is asked about, and then at the same
time as the search. Each stage is timed and saved with the question.
"""

import asyncio
import logging
import time
import uuid
from collections.abc import AsyncIterator
from datetime import date

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.ask import prompts
from app.ask.facts import Fact, first_fact, matching_rows
from app.ask.format import today_ist
from app.ask.retrieve import Hit, search
from app.ask.rules import FAST_FIELDS, keyword_terms, quick_field
from app.ask.vault import VaultDoc, load_vault, vault_list
from app.db.models import Ask, DocumentPage
from app.providers import storage
from app.providers.embeddings import Embedder
from app.providers.llm import Reader

log = logging.getLogger(__name__)

ROUTER_TIMEOUT = 25  # seconds; on timeout we carry on as a plain content search
NOT_FOUND = (
    "I couldn't find this in your documents. If it's in one you haven't added yet, "
    "upload it and ask again."
)
EMPTY_VAULT = "Your vault is empty. Upload a bill, warranty or policy and ask again."
ANSWER_FAILED = "The answer stopped halfway. Try asking again."


class Timer:
    def __init__(self):
        self.start = time.perf_counter()
        self.marks: dict[str, float] = {}

    def mark(self, name: str) -> None:
        self.marks.setdefault(name, round(time.perf_counter() - self.start, 2))


async def ask(
    session: AsyncSession,
    user_id: uuid.UUID,
    question: str,
    ai: Reader,
    embedder: Embedder,
    today: date | None = None,
) -> AsyncIterator[dict]:
    today = today or today_ist()
    timer = Timer()
    record = Ask(user_id=user_id, question=question, route="both", provider=ai.provider)

    docs = await load_vault(session, user_id)
    timer.mark("vault")
    if not docs:
        yield {"type": "route", "route": "both"}
        yield {"type": "not_found", "suggestion": EMPTY_VAULT}
        record.not_found = True
        yield await _finish(session, record, timer)
        return

    # --- Plan: fast-path rules, or the AI router (started now, alongside search) ---
    field, period = quick_field(question)
    field = field if field in FAST_FIELDS and not period else None
    by_n = {d.n: d for d in docs}
    by_id = {d.id: d for d in docs}

    def start_router() -> asyncio.Task:
        return asyncio.create_task(
            ai.structured(
                prompts.ROUTER_PROMPT,
                prompts.router_input(question, str(today), vault_list(docs)),
                prompts.RoutePlan,
            )
        )

    router = None if field else start_router()
    titles = {d.id: d.title for d in docs}
    hits = await search(session, user_id, embedder, question, question, titles)
    timer.mark("search")

    # Two relevance bars, on the embedder's own scale (reranker score, or cosine
    # similarity without one). At or above `sure` a passage is clearly on topic, and
    # a fact card may skip the AI. Between `floor` and `sure` it only counts if the AI
    # router names its document: plain similarity can't tell "car insurance" from the
    # health policy on its own (tracker #39).
    floor, sure = embedder.min_relevance, embedder.sure_relevance
    sure_docs = _unique(by_id[h.document_id] for h in hits if h.relevance >= sure)

    fact: Fact | None = None
    rows: list[Fact] = []
    route = "both"
    if field:
        fact = first_fact(field, sure_docs, today)
        if fact:
            route = "field_lookup"
        else:
            router = start_router()  # not clear enough: ask the router after all

    plan = None
    if router:
        try:
            plan = await asyncio.wait_for(router, ROUTER_TIMEOUT)
        except Exception:
            log.exception("router failed; answering from search alone")
        timer.mark("router")

    named: set[uuid.UUID] = set()
    if plan:
        route = plan.route
        named = {by_n[n].id for n in plan.candidates if n in by_n}
        # A field from the router counts even on a "content" route: "what is my premium?"
        # is often planned as text search, but the premium is a stored field.
        if plan.field and not fact:
            if plan.date_from or plan.date_to:
                rows = matching_rows(
                    plan.field,
                    docs,
                    today,
                    plan.doc_types,
                    _date(plan.date_from),
                    _date(plan.date_to),
                )
            else:
                candidates = _unique([by_n[n] for n in plan.candidates if n in by_n] + sure_docs)
                fact = first_fact(plan.field, candidates, today)
        if plan.search_query and plan.route != "field_lookup" and not hits:
            hits = await search(session, user_id, embedder, plan.search_query, question, titles)
    elif router:
        route = "content_search"  # the router failed: fall back to plain search

    def counts(h: Hit) -> bool:
        if h.relevance >= sure:
            return True
        if h.relevance < floor:
            return False
        if plan:
            return h.document_id in named
        # No AI judgement: only the fact's own document, or anything when the router failed.
        return h.document_id == fact.doc.id if fact else True

    passages = [h for h in hits if counts(h)][:4]
    record.route = route
    yield {"type": "route", "route": route}
    timer.mark("first_event")

    if not (fact or rows or passages):
        record.not_found = True
        yield {"type": "not_found", "suggestion": NOT_FOUND}
        yield await _finish(session, record, timer)
        return

    if fact:
        record.fact = {k: v for k, v in fact.event().items() if k != "type"}
        yield fact.event()

    sources = ([fact] if fact else []) + rows + passages
    citations = await _citations(session, sources, by_id, question)
    record.citations = citations
    yield {"type": "sources", "citations": citations}

    # --- Answer, streamed ---
    numbered = "\n\n".join(
        f"[{i}] {_source_heading(s, by_id)}\n{_source_text(s)}" for i, s in enumerate(sources, 1)
    )
    answer = []
    try:
        async for piece in ai.stream_text(
            prompts.ANSWER_PROMPT, prompts.answer_input(question, numbered)
        ):
            timer.mark("first_word")
            answer.append(piece)
            yield {"type": "delta", "text": piece}
    except Exception:
        log.exception("answer stream failed")
        yield {"type": "error", "message": ANSWER_FAILED}
    record.answer = "".join(answer)
    yield await _finish(session, record, timer)


async def _finish(session: AsyncSession, record: Ask, timer: Timer) -> dict:
    timer.mark("total")
    record.timings = timer.marks
    session.add(record)
    await session.commit()
    log.info("ask %s: route %s, timings %s", record.id, record.route, record.timings)
    return {"type": "done", "askId": str(record.id)}


def _unique(docs) -> list[VaultDoc]:
    seen, out = set(), []
    for d in docs:
        if d.id not in seen:
            seen.add(d.id)
            out.append(d)
    return out


def _date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        return None


def _source_heading(source: Fact | Hit, by_id: dict[uuid.UUID, VaultDoc]) -> str:
    doc = source.doc if isinstance(source, Fact) else by_id[source.document_id]
    kind = "record" if isinstance(source, Fact) else f"page {source.page_no}"
    return f"{doc.title} ({doc.doc_type}), {kind}"


def _source_text(source: Fact | Hit) -> str:
    return source.source_text() if isinstance(source, Fact) else source.content


def _snippet(content: str, question: str, size: int = 200) -> str:
    """~200 characters of the passage, around the first word of the question in it."""
    flat = " ".join(content.split())
    lower = flat.casefold()
    at = min((lower.find(t) for t in keyword_terms(question) if t in lower), default=0)
    start = max(0, at - 60)
    text = flat[start : start + size]
    return ("…" if start else "") + text + ("…" if start + size < len(flat) else "")


async def _citations(
    session: AsyncSession, sources: list, by_id: dict[uuid.UUID, VaultDoc], question: str
) -> list[dict]:
    """The `Citation` shape the web expects, in source order, so "[n]" in the answer
    is citations[n - 1]. Thumbnails are the cited page's image."""
    wanted = []
    for s in sources:
        if isinstance(s, Fact):
            wanted.append((s.doc.id, (s.box or {}).get("page", 1)))
        else:
            wanted.append((s.document_id, s.page_no))
    rows = await session.execute(
        select(DocumentPage.document_id, DocumentPage.page_no, DocumentPage.image_key).where(
            tuple_(DocumentPage.document_id, DocumentPage.page_no).in_(wanted)
        )
    )
    keys = {(r.document_id, r.page_no): r.image_key for r in rows}
    urls = await storage.signed_urls(sorted(set(keys.values())), expires_in=3600)

    out = []
    for s, (doc_id, page) in zip(sources, wanted, strict=True):
        doc = by_id[doc_id]
        citation = {
            "documentId": str(doc_id),
            "title": doc.title,
            "docType": doc.doc_type,
            "page": page,
            "snippet": s.source_text() if isinstance(s, Fact) else _snippet(s.content, question),
            "thumbnailUrl": urls.get(keys.get((doc_id, page), "")),
        }
        box = s.box
        if box:
            citation["box"] = box
        out.append(citation)
    return out
