"""Gemini: the same two jobs as ClaudeReader (app/providers/llm.py), through Google's
google-genai SDK. Chosen with LLM_PROVIDER=gemini.

Differences worth knowing:
- Gemini is trained to give image positions as box_2d = [ymin, xmin, ymax, xmax] on a
  0-1000 scale, so we ask for exactly that and convert to the % boxes the pipeline uses.
- The free tier allows only a few requests a minute: the SDK retries 429s with
  backoff, and pages are read one at a time.
- Thinking is kept low: extraction is a lookup, not a puzzle, and thinking tokens cost
  time (and money on a paid key). Flash-Lite allows MINIMAL; Flash's lowest is LOW.
"""

from collections.abc import AsyncIterator
from typing import TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.config import get_settings
from app.providers.llm import (
    EXTRACT_PROMPT,
    GEMINI_TRANSCRIBE_PROMPT,
    Extraction,
    SeenLine,
    Transcription,
    Usage,
)

T = TypeVar("T", bound=BaseModel)

# Retry rate limits and Google-side hiccups: 2 s, 4 s, 8 s, 16 s.
RETRY = types.HttpRetryOptions(
    attempts=5, initial_delay=2, max_delay=30, exp_base=2, http_status_codes=[429, 500, 503]
)


def make_client() -> genai.Client:
    return genai.Client(
        api_key=get_settings().gemini_api_key,
        http_options=types.HttpOptions(retry_options=RETRY, timeout=120_000),  # ms
    )


class GeminiLine(BaseModel):
    text: str
    box_2d: list[int] = Field(description="[ymin, xmin, ymax, xmax], each 0-1000")


class GeminiTranscription(BaseModel):
    readable: bool = Field(description="False if this isn't a document or can't be read")
    lines: list[GeminiLine]


def to_seen_line(line: GeminiLine) -> SeenLine:
    """box_2d (0-1000, y first) → % box (x, y, w, h). A malformed box falls back to the
    whole page, so the text is kept and a highlight still lands on the right page."""
    box = line.box_2d
    if len(box) != 4 or box[2] <= box[0] or box[3] <= box[1]:
        return SeenLine(text=line.text, x=0, y=0, w=100, h=100)
    ymin, xmin, ymax, xmax = (max(0, min(1000, v)) / 10 for v in box)
    return SeenLine(text=line.text, x=xmin, y=ymin, w=xmax - xmin, h=ymax - ymin)


def _parsed(response: types.GenerateContentResponse):
    """The schema-checked result. None means Gemini's reply didn't fit the schema (cut
    off, or blocked); fail loudly so the document gets a Retry button."""
    if response.parsed is None:
        reason = response.candidates[0].finish_reason if response.candidates else "no reply"
        raise ValueError(f"Gemini returned no usable result ({reason})")
    return response.parsed


class GeminiReader:
    provider = "gemini"
    max_concurrency = 1

    def __init__(self, client: genai.Client | None = None):
        settings = get_settings()
        self._client = client
        self.fast_model = settings.gemini_fast_model
        self.smart_model = settings.gemini_smart_model
        self.usage = Usage()

    @property
    def client(self) -> genai.Client:
        # Created on first use: genai.Client refuses to start without a key, and the
        # worker must still boot (and say "not set up yet") when the key is missing.
        if self._client is None:
            self._client = make_client()
        return self._client

    async def transcribe(self, image_jpeg: bytes) -> Transcription:
        response = await self.client.aio.models.generate_content(
            model=self.smart_model,
            contents=[
                types.Part.from_bytes(data=image_jpeg, mime_type="image/jpeg"),
                "Transcribe this page.",
            ],
            config=self._config(
                GEMINI_TRANSCRIBE_PROMPT,
                GeminiTranscription,
                max_tokens=8000,
                thinking=types.ThinkingLevel.LOW,
            ),
        )
        self._count(self.smart_model, response)
        seen: GeminiTranscription = _parsed(response)
        return Transcription(readable=seen.readable, lines=[to_seen_line(x) for x in seen.lines])

    async def extract(self, text: str, filename: str) -> Extraction:
        response = await self.client.aio.models.generate_content(
            model=self.fast_model,
            contents=f"File name: {filename}\n<document>\n{text}\n</document>",
            config=self._config(
                EXTRACT_PROMPT, Extraction, max_tokens=2000, thinking=types.ThinkingLevel.MINIMAL
            ),
        )
        self._count(self.fast_model, response)
        return _parsed(response)

    async def structured(self, system: str, prompt: str, schema: type[T]) -> T:
        """Fast model, schema-checked reply (used by Ask's router)."""
        response = await self.client.aio.models.generate_content(
            model=self.fast_model,
            contents=prompt,
            config=self._config(
                system, schema, max_tokens=1000, thinking=types.ThinkingLevel.MINIMAL
            ),
        )
        self._count(self.fast_model, response)
        return _parsed(response)

    async def stream_text(self, system: str, prompt: str) -> AsyncIterator[str]:
        """Smart model, answer streamed as it's written."""
        last = None
        async for chunk in await self.client.aio.models.generate_content_stream(
            model=self.smart_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=1000,
                thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW),
            ),
        ):
            last = chunk
            if chunk.text:
                yield chunk.text
        if last is not None:
            self._count(self.smart_model, last)  # the final chunk carries the token counts

    def _config(
        self, system: str, schema: type[BaseModel], max_tokens: int, thinking: types.ThinkingLevel
    ):
        return types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            max_output_tokens=max_tokens,
            thinking_config=types.ThinkingConfig(thinking_level=thinking),
        )

    def _count(self, model: str, response: types.GenerateContentResponse) -> None:
        meta = response.usage_metadata
        if meta is None:
            return
        # Thinking tokens are billed as output.
        output = (meta.candidates_token_count or 0) + (meta.thoughts_token_count or 0)
        self.usage.add(model, meta.prompt_token_count or 0, output)
