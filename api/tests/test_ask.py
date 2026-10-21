"""Ask: formatting and ranking helpers, then the whole POST /ask stream against the dev
database (rolled back) with a fake AI and a fake Voyage."""

import json
import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.ask.format import inr, long_date, relative_days
from app.ask.prompts import RoutePlan
from app.ask.retrieve import rrf
from app.ask.rules import keyword_terms, quick_field
from app.config import get_settings
from app.db.models import EMBEDDING_DIMS, Ask, Chunk, Document, DocumentPage, User
from app.main import app
from app.routes import ask as ask_route
from tests.conftest import needs_db

# --- Helpers (no database) ---


def test_inr_uses_indian_grouping():
    assert inr(Decimal("124500")) == "₹1,24,500"
    assert inr(1179.5) == "₹1,179.50"
    assert inr(Decimal("10000000")) == "₹1,00,00,000"
    assert inr(499) == "₹499"


def test_dates_read_like_the_web_app():
    assert long_date(date(2027, 3, 12)) == "12 Mar 2027"
    assert [relative_days(d) for d in (0, 1, -1, 12, -6, 95, 400)] == [
        "today",
        "tomorrow",
        "yesterday",
        "in 12 days",
        "6 days ago",
        "in 3 months",
        "in 1.1 years",
    ]


def test_rrf_rewards_items_high_in_both_lists():
    a, b, c, d = (uuid.uuid4() for _ in range(4))
    assert rrf([a, b, c], [c, d, a])[:2] == [a, c]  # a: 1st + 3rd beats b: 2nd only
    assert rrf([], []) == []


def test_keyword_terms_keep_hindi_and_drop_filler():
    assert keyword_terms("बिजली बिल kitna hai? The Coolwave fridge!") == [
        "बिजली",
        "बिल",
        "kitna",
        "coolwave",
        "fridge",
    ]


def test_quick_field():
    assert quick_field("When is my electricity bill due?") == ("due_date", False)
    assert quick_field("mera fridge warranty kab khatam hoga?") == ("expiry_date", False)
    assert quick_field("How much did I pay for bills in October?")[1] is True
    assert quick_field("Does my policy cover dental?") == (None, False)


# --- The whole stream, with fakes ---

AXES = ["warranty", "compressor", "electricity", "bill", "units", "dental", "car"]


def vec(text: str) -> list[float]:
    """A tiny 'embedding': one axis per known word, so similar texts point the same way."""
    v = [0.0] * EMBEDDING_DIMS
    for i, word in enumerate(AXES):
        if word in text.casefold():
            v[i] = 1.0
    v[-1] = 0.1  # never a zero vector
    return v


class FakeEmbedder:
    async def embed(self, texts, input_type):
        return [vec(t) for t in texts]

    async def rerank(self, query, documents, top_k):
        """Share of the question's known words found in the passage."""
        words = [w for w in AXES if w in query.casefold()] or ["?"]
        scored = [
            (i, sum(w in d.casefold() for w in words) / len(words)) for i, d in enumerate(documents)
        ]
        return sorted(scored, key=lambda s: -s[1])[:top_k]


class FakeAI:
    provider = "fake"
    fast_model, smart_model, max_concurrency = "fast", "smart", 1

    def __init__(self, plan: RoutePlan | None = None, fail_answer: bool = False):
        self.plan = plan
        self.fail_answer = fail_answer
        self.router_calls = 0
        self.answer_prompt = ""

    async def structured(self, system, prompt, schema):
        self.router_calls += 1
        return self.plan or RoutePlan(
            route="content_search",
            field=None,
            candidates=[],
            doc_types=[],
            date_from=None,
            date_to=None,
            search_query="",
        )

    async def stream_text(self, system, prompt):
        self.answer_prompt = prompt
        yield "It's on "
        if self.fail_answer:
            raise RuntimeError("provider went away")
        yield "page 1 [1]."


@pytest.fixture
def ai_setup(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "test")
    monkeypatch.setattr(settings, "embeddings_api_key", "test")
    app.dependency_overrides[ask_route.get_embedder] = FakeEmbedder

    def use(ai: FakeAI) -> FakeAI:
        app.dependency_overrides[ask_route.get_ai] = lambda: ai
        return ai

    return use


async def seed(db, user_id, docs: list[dict]):
    if not await db.get(User, user_id):
        db.add(User(id=user_id, email=f"{user_id}@example.invalid"))
    for spec in docs:
        doc = Document(
            user_id=user_id,
            file_key=f"{user_id}/{uuid.uuid4()}/f.pdf",
            original_filename="f.pdf",
            mime_type="application/pdf",
            size_bytes=1,
            status="ready",
            page_count=1,
            **spec["doc"],
        )
        db.add(doc)
        await db.flush()
        db.add(
            DocumentPage(
                document_id=doc.id,
                user_id=user_id,
                page_no=1,
                image_key=f"{user_id}/{doc.id}/pages/1.webp",
                width=1200,
                height=1697,
                text=spec["text"],
                text_source="pdf_text",
            )
        )
        db.add(
            Chunk(
                document_id=doc.id,
                user_id=user_id,
                page_no=1,
                ordinal=0,
                content=spec["text"],
                box={"page": 1, "x": 5, "y": 5, "w": 90, "h": 30},
                embedding=vec(spec["text"]),
            )
        )
    await db.flush()


WARRANTY = {
    "doc": {
        "doc_type": "warranty",
        "title": "Coolwave fridge warranty",
        "vendor": "Coolwave",
        "doc_date": date(2025, 3, 2),
        "expiry_date": date(2027, 3, 2),
        "field_boxes": {"expiryDate": {"page": 1, "x": 10, "y": 20, "w": 30, "h": 2}},
    },
    "text": "Coolwave warranty: 2 years comprehensive. Compressor warranty 10 years.",
}
BILL = {
    "doc": {
        "doc_type": "bill",
        "title": "BrightGrid electricity bill",
        "vendor": "BrightGrid",
        "amount": Decimal("2340.50"),
        "doc_date": date(2026, 10, 1),
        "due_date": date(2026, 10, 25),
        "field_boxes": {"dueDate": {"page": 1, "x": 12, "y": 24, "w": 11, "h": 2}},
    },
    "text": "BrightGrid electricity bill. Units used: 214 kWh. Amount due Rs. 2,340.50.",
}


def events_of(response) -> list[dict]:
    """Parse the exact framing the web app's parser expects: `data: {json}` + blank line."""
    assert response.headers["content-type"].startswith("text/event-stream")
    chunks = response.text.split("\n\n")
    assert chunks[-1] == ""
    assert all(c.startswith("data: ") and "\n" not in c for c in chunks[:-1])
    return [json.loads(c.removeprefix("data: ")) for c in chunks[:-1]]


@needs_db
async def test_fast_path_answers_a_date_without_the_router(client_for, users, db, ai_setup):
    ai = ai_setup(FakeAI())
    await seed(db, users[0], [WARRANTY, BILL])

    r = await client_for(0).post("/ask", json={"question": "When is my electricity bill due?"})
    events = events_of(r)

    assert [e["type"] for e in events] == ["route", "fact", "sources", "delta", "delta", "done"]
    assert events[0] == {"type": "route", "route": "field_lookup"}
    assert events[1]["label"] == "Pay by" and events[1]["value"] == "25 Oct 2026"
    first = events[2]["citations"][0]
    assert first["title"] == "BrightGrid electricity bill"
    assert first["box"]["y"] == 24  # the due date's highlight
    assert first["thumbnailUrl"].endswith("/pages/1.webp")
    assert ai.router_calls == 0  # fast path: no ~5 s router call
    assert "[1] BrightGrid electricity bill (bill), record\nPay by: 25 Oct 2026" in ai.answer_prompt

    saved = await db.get(Ask, uuid.UUID(events[-1]["askId"]))
    assert saved.route == "field_lookup" and saved.fact["value"] == "25 Oct 2026"
    assert saved.answer == "It's on page 1 [1]." and saved.provider == "fake"
    assert {"search", "first_event", "first_word", "total"} <= set(saved.timings)


@needs_db
async def test_router_path_answers_from_passages(client_for, users, db, ai_setup):
    ai = ai_setup(FakeAI())
    await seed(db, users[0], [WARRANTY, BILL])

    r = await client_for(0).post("/ask", json={"question": "Is the compressor under warranty?"})
    events = events_of(r)

    assert ai.router_calls == 1
    assert [e["type"] for e in events][:2] == ["route", "sources"]
    assert events[0]["route"] == "content_search"
    assert events[1]["citations"][0]["title"] == "Coolwave fridge warranty"
    assert "Compressor warranty 10 years" in events[1]["citations"][0]["snippet"]


@needs_db
async def test_router_period_question_lists_several_documents(client_for, users, db, ai_setup):
    october = RoutePlan(
        route="field_lookup",
        field="amount",
        candidates=[],
        doc_types=["bill"],
        date_from="2026-10-01",
        date_to="2026-10-31",
        search_query="bills october",
    )
    ai = ai_setup(FakeAI(plan=october))
    second = {
        "doc": BILL["doc"]
        | {
            "title": "SkyFibre internet bill",
            "amount": Decimal("1180"),
            "doc_date": date(2026, 10, 15),
        },
        "text": "SkyFibre internet bill",
    }
    await seed(db, users[0], [BILL, second, WARRANTY])

    r = await client_for(0).post(
        "/ask", json={"question": "How much did I pay for bills in October?"}
    )
    events = events_of(r)

    assert "fact" not in [e["type"] for e in events]  # several bills: no single fact card
    titles = [c["title"] for c in events[1]["citations"]]
    assert titles[:2] == ["BrightGrid electricity bill", "SkyFibre internet bill"]
    assert "₹2,340.50" in ai.answer_prompt and "₹1,180" in ai.answer_prompt


@needs_db
async def test_not_found_when_nothing_matches(client_for, users, db, ai_setup):
    ai_setup(FakeAI())
    await seed(db, users[0], [WARRANTY])

    r = await client_for(0).post("/ask", json={"question": "When does my car insurance expire?"})
    assert [e["type"] for e in events_of(r)] == ["route", "not_found", "done"]


@needs_db
async def test_other_peoples_documents_never_appear(client_for, users, db, ai_setup):
    ai = ai_setup(FakeAI())
    await seed(db, users[0], [WARRANTY])  # only user 0 has a warranty
    await seed(db, users[1], [BILL])

    r = await client_for(1).post("/ask", json={"question": "Is the compressor under warranty?"})
    events = events_of(r)
    assert all("Coolwave" not in json.dumps(e) for e in events)
    assert "Coolwave" not in ai.answer_prompt


@needs_db
async def test_answer_failure_becomes_an_error_event(client_for, users, db, ai_setup):
    ai_setup(FakeAI(fail_answer=True))
    await seed(db, users[0], [BILL])

    r = await client_for(0).post("/ask", json={"question": "When is my electricity bill due?"})
    types = [e["type"] for e in events_of(r)]
    assert types[-2:] == ["error", "done"]


@needs_db
async def test_daily_limit_history_and_feedback(client_for, users, db, ai_setup, monkeypatch):
    ai_setup(FakeAI())
    await seed(db, users[0], [BILL])
    a, b = client_for(0), client_for(1)

    r = await a.post("/ask", json={"question": "When is my electricity bill due?"})
    ask_id = events_of(r)[-1]["askId"]

    history = (await a.get("/asks")).json()
    assert history[0]["id"] == ask_id and history[0]["factValue"] == "25 Oct 2026"
    assert (await b.get("/asks")).json() == []

    assert (await b.post(f"/asks/{ask_id}/feedback", json={"value": "up"})).status_code == 404
    assert (await a.post(f"/asks/{ask_id}/feedback", json={"value": "up"})).status_code == 204
    assert (await db.get(Ask, uuid.UUID(ask_id))).feedback == "up"

    monkeypatch.setattr(get_settings(), "daily_ask_limit", 1)
    r = await a.post("/ask", json={"question": "again?"})
    assert r.status_code == 429 and "Try again tomorrow" in r.json()["detail"]


@needs_db
async def test_empty_vault(client_for, users, ai_setup):
    ai_setup(FakeAI())
    r = await client_for(0).post("/ask", json={"question": "When is my bill due?"})
    events = events_of(r)
    assert events[1]["type"] == "not_found" and "vault is empty" in events[1]["suggestion"]
