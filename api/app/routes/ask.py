"""Ask: a question in, a stream of answer events out (Server-Sent Events), plus the
recent-questions list and thumbs up/down. The pipeline is in app/ask/service.py."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.ask.service import ask
from app.auth import CurrentUser, DbSession
from app.config import get_settings
from app.db.models import Ask
from app.providers import embeddings
from app.providers.embeddings import Embedder
from app.providers.llm import Reader, get_reader, reader_configured
from app.schemas import CamelModel

router = APIRouter(tags=["ask"])


def get_ai() -> Reader:
    return get_reader()


def get_embedder() -> Embedder:
    return embeddings.get_embedder()


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class AskHistoryOut(CamelModel):
    id: uuid.UUID
    question: str
    fact_value: str | None = None
    asked_at: datetime


class FeedbackIn(BaseModel):
    value: Literal["up", "down"]


def sse(event: dict) -> str:
    """The web app's framing: one `data:` line of JSON per event, blank line after."""
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"


@router.post("/ask")
async def ask_question(
    body: AskIn,
    user: CurrentUser,
    session: DbSession,
    ai: Annotated[Reader, Depends(get_ai)],
    embedder: Annotated[Embedder, Depends(get_embedder)],
):
    question = " ".join(body.question.split())[:500]
    if not (reader_configured() and embeddings.embeddings_configured()):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Ask isn't set up on this server yet."
        )
    limit = get_settings().daily_ask_limit
    asked_today = await session.scalar(
        select(func.count()).where(
            Ask.user_id == user.id, Ask.created_at > datetime.now(UTC) - timedelta(days=1)
        )
    )
    if asked_today >= limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"You've asked {limit} questions in the last 24 hours. Try again tomorrow.",
        )

    async def events():
        async for event in ask(session, user.id, question, ai, embedder):
            yield sse(event)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        # no-transform + X-Accel-Buffering: stop proxies from holding the stream back.
        headers={"Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no"},
    )


@router.get("/asks", response_model=list[AskHistoryOut])
async def recent_asks(
    user: CurrentUser, session: DbSession, limit: Annotated[int, Query(ge=1, le=50)] = 8
):
    rows = await session.scalars(
        select(Ask).where(Ask.user_id == user.id).order_by(Ask.created_at.desc()).limit(limit)
    )
    return [
        AskHistoryOut(
            id=a.id,
            question=a.question,
            fact_value=(a.fact or {}).get("value"),
            asked_at=a.created_at,
        )
        for a in rows
    ]


@router.post("/asks/{ask_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def ask_feedback(ask_id: uuid.UUID, body: FeedbackIn, user: CurrentUser, session: DbSession):
    record = await session.scalar(select(Ask).where(Ask.id == ask_id, Ask.user_id == user.id))
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")
    record.feedback = body.value
    await session.commit()
