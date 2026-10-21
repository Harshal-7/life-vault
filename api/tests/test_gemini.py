"""Gemini reader with a fake google-genai client (no network), and the provider switch."""

from types import SimpleNamespace

import pytest
from google.genai import types

from app.config import get_settings
from app.db.models import EMBEDDING_DIMS
from app.providers import llm
from app.providers.embeddings import (
    GeminiEmbedder,
    VoyageEmbedder,
    embeddings_configured,
    get_embedder,
)
from app.providers.gemini import GeminiLine, GeminiReader, GeminiTranscription, to_seen_line
from app.providers.llm import ClaudeReader, Extraction, FieldValue

NONE = FieldValue(value=None, as_printed=None, page=None, confidence=0)


def test_box_2d_becomes_percent_box():
    line = to_seen_line(GeminiLine(text="Total Rs. 499", box_2d=[100, 50, 130, 450]))
    assert (line.x, line.y, line.w, line.h) == (5.0, 10.0, 40.0, 3.0)
    # Out-of-range values are clamped to the page.
    edge = to_seen_line(GeminiLine(text="x", box_2d=[-20, 900, 40, 1200]))
    assert (edge.x, edge.y, edge.w, edge.h) == (90.0, 0.0, 10.0, 4.0)


def test_malformed_box_keeps_the_text():
    for bad in ([1, 2, 3], [500, 0, 100, 10]):  # too short; ymax above ymin
        line = to_seen_line(GeminiLine(text="kept", box_2d=bad))
        assert line.text == "kept" and (line.x, line.y, line.w, line.h) == (0, 0, 100, 100)


class FakeModels:
    def __init__(self, parsed):
        self.parsed = parsed
        self.calls: list[dict] = []

    async def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return types.GenerateContentResponse(
            parsed=self.parsed,
            usage_metadata=types.GenerateContentResponseUsageMetadata(
                prompt_token_count=100, candidates_token_count=20, thoughts_token_count=5
            ),
        )


def fake_client(parsed) -> tuple[SimpleNamespace, FakeModels]:
    models = FakeModels(parsed)
    return SimpleNamespace(aio=SimpleNamespace(models=models)), models


async def test_transcribe_sends_the_image_and_converts_boxes():
    seen = GeminiTranscription(
        readable=True, lines=[GeminiLine(text="Spinwell", box_2d=[50, 100, 80, 400])]
    )
    client, models = fake_client(seen)
    reader = GeminiReader(client=client)

    result = await reader.transcribe(b"\xff\xd8jpeg-bytes")

    [call] = models.calls
    assert call["model"] == get_settings().gemini_smart_model
    image = call["contents"][0]
    assert image.inline_data.data == b"\xff\xd8jpeg-bytes"
    assert image.inline_data.mime_type == "image/jpeg"
    assert call["config"].response_schema is GeminiTranscription
    assert "box_2d" in call["config"].system_instruction
    assert result.lines[0].text == "Spinwell" and result.lines[0].x == 10.0
    assert (reader.usage.input_tokens, reader.usage.output_tokens) == (100, 25)


async def test_extract_uses_the_fast_model_and_wraps_text_as_data():
    extraction = Extraction(
        doc_type="bill",
        title="SkyFibre internet bill",
        tags=[],
        vendor=NONE,
        amount=NONE,
        doc_date=NONE,
        expiry_date=NONE,
        due_date=NONE,
        reference=NONE,
    )
    client, models = fake_client(extraction)
    result = await GeminiReader(client=client).extract("[Page 1]\nhello", "bill.pdf")

    [call] = models.calls
    assert call["model"] == get_settings().gemini_fast_model
    assert "<document>\n[Page 1]\nhello\n</document>" in call["contents"]
    assert call["config"].response_schema is Extraction
    assert result.title == "SkyFibre internet bill"


async def test_unusable_reply_is_an_error():
    client, _ = fake_client(None)
    with pytest.raises(ValueError, match="no usable result"):
        await GeminiReader(client=client).extract("x", "x.pdf")


def test_provider_switch(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    assert isinstance(llm.get_reader(), GeminiReader)
    assert not llm.reader_configured()
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    assert llm.reader_configured()

    monkeypatch.setattr(settings, "llm_provider", "claude")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    assert isinstance(llm.get_reader(), ClaudeReader)
    assert not llm.reader_configured()  # the Gemini key doesn't count for Claude


# --- Embeddings ---


class FakeEmbedModels:
    def __init__(self):
        self.calls = []

    async def embed_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return SimpleNamespace(embeddings=[SimpleNamespace(values=[0.1] * 4) for _ in contents])


async def test_gemini_embeddings_batch_and_tag_queries():
    models = FakeEmbedModels()
    embedder = GeminiEmbedder(client=SimpleNamespace(aio=SimpleNamespace(models=models)))

    vectors = await embedder.embed([f"passage {i}" for i in range(150)], "document")
    assert len(vectors) == 150
    assert [len(c["contents"]) for c in models.calls] == [100, 50]  # batches of 100
    assert models.calls[0]["config"].task_type == "RETRIEVAL_DOCUMENT"
    assert models.calls[0]["config"].output_dimensionality == EMBEDDING_DIMS

    await embedder.embed(["when is my bill due?"], "query")
    assert models.calls[-1]["config"].task_type == "RETRIEVAL_QUERY"
    assert not embedder.can_rerank


def test_embeddings_switch(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "embeddings_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    assert isinstance(get_embedder(), GeminiEmbedder) and not embeddings_configured()
    monkeypatch.setattr(settings, "gemini_api_key", "k")
    assert embeddings_configured()
    monkeypatch.setattr(settings, "embeddings_provider", "voyage")
    monkeypatch.setattr(settings, "embeddings_api_key", "")
    assert isinstance(get_embedder(), VoyageEmbedder) and not embeddings_configured()
