from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings, read from environment variables (or api/.env in development).

    Secrets stay empty by default so the app can boot and run tests without them;
    features that need a key check for it when they're used.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    cors_origins: list[str] = ["http://localhost:3000"]

    supabase_url: str = ""
    supabase_secret_key: str = ""
    database_url: str = ""
    redis_url: str = ""

    anthropic_api_key: str = ""
    embeddings_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
