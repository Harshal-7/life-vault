"""One-time setup: create the private documents bucket. Safe to run again.

uv run python -m app.scripts.setup_storage
"""

import asyncio

from app.providers.storage import BUCKET, ensure_bucket


async def main() -> None:
    created = await ensure_bucket()
    print(f"bucket '{BUCKET}': {'created' if created else 'already exists'} (private)")


if __name__ == "__main__":
    asyncio.run(main())
