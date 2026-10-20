from sqlalchemy import func, select, text

from app.db.models import DOCUMENT_STATUSES, EMBEDDING_DIMS, Chunk, Document, User
from app.db.session import async_database_url
from tests.conftest import needs_db


def test_async_database_url_uses_psycopg_driver():
    assert async_database_url("postgresql://u:p@h:5432/db") == "postgresql+psycopg://u:p@h:5432/db"
    assert async_database_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_document_status_check_lists_every_status():
    check = next(c for c in Document.__table__.constraints if c.name == "documents_status_check")
    for status in DOCUMENT_STATUSES:
        assert repr(status) in str(check.sqltext)


# --- Integration: runs only when a dev database is configured (skipped in CI) ---


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


@needs_db
async def test_new_tables_have_row_level_security():
    from app.db.session import engine

    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "select relname, relrowsecurity from pg_class "
                "where relnamespace = 'public'::regnamespace "
                "and relname in ('document_pages', 'chunks')"
            )
        )
        rls = dict(rows.all())
    await engine.dispose()

    assert rls == {"document_pages": True, "chunks": True}


def _unit(i: int) -> list[float]:
    """A 1024-dim vector pointing along axis i (cosine distance to itself is 0)."""
    v = [0.0] * EMBEDDING_DIMS
    v[i] = 1.0
    return v


@needs_db
async def test_chunks_store_vectors_and_keywords(db, users):
    user_id = users[0]
    db.add(User(id=user_id, email="t@example.invalid"))
    doc = Document(
        user_id=user_id,
        file_key=f"{user_id}/x.pdf",
        original_filename="x.pdf",
        mime_type="application/pdf",
        size_bytes=1,
    )
    db.add(doc)
    await db.flush()
    db.add_all(
        [
            Chunk(
                document_id=doc.id,
                user_id=user_id,
                page_no=1,
                ordinal=0,
                content="Compressor warranty 10 years",
                embedding=_unit(0),
            ),
            Chunk(
                document_id=doc.id,
                user_id=user_id,
                page_no=2,
                ordinal=1,
                content="बिजली बिल amount due",
                embedding=_unit(1),
            ),
        ]
    )
    await db.flush()

    nearest = await db.scalar(
        select(Chunk.content).order_by(Chunk.embedding.op("<=>")(_unit(1))).limit(1)
    )
    assert nearest == "बिजली बिल amount due"

    # 'simple' config: the Hindi word matches exactly as written.
    hit = await db.scalar(
        select(Chunk.page_no).where(
            Chunk.tsv.op("@@")(func.websearch_to_tsquery("simple", "बिजली"))
        )
    )
    assert hit == 2

    stored = await db.scalar(select(Chunk.embedding).where(Chunk.page_no == 1))
    assert stored == _unit(0)
