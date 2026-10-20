"""Background jobs go through Redis (Upstash) with arq. The API only enqueues;
`worker.py` does the slow work."""

import logging
import uuid

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.config import get_settings

log = logging.getLogger(__name__)
_pool: ArqRedis | None = None


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


async def get_pool() -> ArqRedis | None:
    global _pool
    if _pool is None and get_settings().redis_url:
        _pool = await create_pool(redis_settings())
    return _pool


async def enqueue_processing(document_id: uuid.UUID) -> bool:
    """Queue a document for reading. Returns False if no queue is configured."""
    pool = await get_pool()
    if pool is None:
        log.warning("REDIS_URL not set: document %s was not queued", document_id)
        return False
    await pool.enqueue_job("process_document", str(document_id), _job_id=f"process:{document_id}")
    return True


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
