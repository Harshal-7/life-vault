import pytest
from sqlalchemy import text

from app.config import get_settings
from app.db.models import DOCUMENT_STATUSES, Document
from app.db.session import async_database_url


def test_async_database_url_uses_psycopg_driver():
    assert async_database_url("postgresql://u:p@h:5432/db") == "postgresql+psycopg://u:p@h:5432/db"
    assert async_database_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_document_status_check_lists_every_status():
    check = next(c for c in Document.__table__.constraints if c.name == "documents_status_check")
    for status in DOCUMENT_STATUSES:
        assert repr(status) in str(check.sqltext)


# --- Integration: runs only when a dev database is configured (skipped in CI) ---

needs_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")


@needs_db
async def test_tables_have_row_level_security():
    from app.db.session import engine

    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "select relname, relrowsecurity from pg_class "
                "where relnamespace = 'public'::regnamespace "
                "and relname in ('users', 'documents')"
            )
        )
        rls = dict(rows.all())
    await engine.dispose()

    assert rls == {"users": True, "documents": True}
