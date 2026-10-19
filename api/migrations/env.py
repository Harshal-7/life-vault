"""Alembic entry point: runs migrations against DATABASE_URL from api/.env.

The URL is read from app settings (not alembic.ini) so secrets stay out of the repo.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings
from app.db.models import Base
from app.db.session import async_database_url

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Autogenerate compares the database against these models.
target_metadata = Base.metadata

DATABASE_URL = async_database_url(get_settings().database_url)


def include_object(object, name, type_, reflected, compare_to):
    """Ignore foreign keys into Supabase-managed schemas (e.g. users.id → auth.users).
    They're added by hand in migrations; without this, autogenerate would drop them."""
    if type_ == "foreign_key_constraint":
        referred = getattr(object, "referred_table", None)
        if referred is not None and referred.schema not in (None, "public"):
            return False
    return True


def run_migrations_offline() -> None:
    """`alembic upgrade head --sql`: print the SQL instead of running it."""
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection, target_metadata=target_metadata, include_object=include_object
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set (see .env.example)")
    engine = create_async_engine(DATABASE_URL, poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
