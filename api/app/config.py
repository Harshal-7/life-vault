import json
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """App settings, read from environment variables (or api/.env in development).

    Secrets stay empty by default so the app can boot and run tests without them;
    features that need a key check for it when they're used.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    # Comma-separated ("http://a, http://b") or a JSON list (["http://a"]).
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3001"]

    supabase_url: str = ""
    supabase_secret_key: str = ""
    database_url: str = ""
    redis_url: str = ""

    # Which AI reads documents (and, from M2, answers questions). Both are built in;
    # switching is just this setting. Gemini first for now: its free tier makes
    # testing free, but free-tier data may be used by Google, so real documents
    # should go through a paid key (tracker #34).
    llm_provider: Literal["gemini", "claude"] = "gemini"

    gemini_api_key: str = ""
    anthropic_api_key: str = ""
    # Voyage AI key: embeddings (search by meaning) and the reranker.
    embeddings_api_key: str = ""

    # Each provider has a fast, cheap model (reading PDF text, routing) and a smarter
    # one (reading photos, writing answers).
    gemini_fast_model: str = "gemini-3.5-flash-lite"
    gemini_smart_model: str = "gemini-3.8-flash"
    claude_fast_model: str = "claude-haiku-5-5"
    claude_smart_model: str = "claude-sonnet-5-5"
    embeddings_model: str = "voyage-3.5"
    rerank_model: str = "rerank-2.5-lite"

    # Guards against surprise AI bills on a public site (per user, per day).
    daily_document_limit: int = 50
    daily_ask_limit: int = 100
    max_pages: int = 50

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    pass  # e.g. [http://a] after a dotenv loader stripped the quotes
            return [part.strip() for part in text.strip("[]").split(",") if part.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
