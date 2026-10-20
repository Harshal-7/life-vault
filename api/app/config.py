import json
from functools import lru_cache
from typing import Annotated

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

    anthropic_api_key: str = ""
    embeddings_api_key: str = ""

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
