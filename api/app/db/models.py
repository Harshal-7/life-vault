"""Database tables, defined as Python classes.

Alembic reads these classes to generate migrations, and the API uses them to query.
Statuses and sources are plain text with CHECK constraints instead of Postgres ENUM
types: adding a new value later is a one-line migration instead of an ALTER TYPE dance.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Computed,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import UserDefinedType

DOCUMENT_SOURCES = ("upload", "camera", "email")
DOCUMENT_STATUSES = ("uploaded", "processing", "needs_review", "ready", "failed")
# How a page's text was read: straight from the PDF, or by Claude looking at an image.
TEXT_SOURCES = ("pdf_text", "vision")
EMBEDDING_DIMS = 1024  # voyage-3.5 default


class Vector(UserDefinedType):
    """pgvector's `vector(n)` column. Python side is a plain list of floats; Postgres
    accepts and returns the text form "[0.1,0.2,...]". (The `pgvector` package does
    this too, but drags in numpy for no gain here.)"""

    cache_ok = True

    def __init__(self, dims: int):
        self.dims = dims

    def get_col_spec(self, **kw) -> str:
        return f"vector({self.dims})"

    def bind_processor(self, dialect):
        def process(value: list[float] | None) -> str | None:
            return None if value is None else "[" + ",".join(map(str, value)) + "]"

        return process

    def result_processor(self, dialect, coltype):
        def process(value: str | None) -> list[float] | None:
            return None if value is None else [float(x) for x in value.strip("[]").split(",")]

        return process


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Base(DeclarativeBase):
    pass


class User(Base):
    """One row per person. `id` is the same UUID Supabase Auth gives the user,
    so a login token's `sub` claim maps straight to this row."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320))
    # The part before @ in their forwarding address (used in M4 for email capture).
    inbound_alias: Mapped[str | None] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    documents: Mapped[list["Document"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class Document(Base):
    """One uploaded file. The file itself lives in Supabase Storage at `file_key`;
    this row holds what we know about it."""

    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(_in("source", DOCUMENT_SOURCES), name="documents_source_check"),
        CheckConstraint(_in("status", DOCUMENT_STATUSES), name="documents_status_check"),
        # The vault list is always "my documents, newest first".
        Index("ix_documents_user_created", "user_id", "created_at"),
        # Duplicate check: "has this user already uploaded a file with this hash?"
        Index("ix_documents_user_sha256", "user_id", "sha256"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    file_key: Mapped[str] = mapped_column(Text, unique=True)
    original_filename: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(127))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str | None] = mapped_column(String(64))

    source: Mapped[str] = mapped_column(String(16), server_default="upload")
    status: Mapped[str] = mapped_column(String(16), server_default="uploaded")
    error: Mapped[str | None] = mapped_column(Text)

    # Filled in by the ingestion pipeline (M1).
    doc_type: Mapped[str | None] = mapped_column(String(32))
    title: Mapped[str | None] = mapped_column(Text)
    page_count: Mapped[int] = mapped_column(Integer, server_default="0")
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")

    # Extracted fields. Real columns (not JSON) so Ask can answer "when does X
    # expire?" with plain SQL, and M3 can list upcoming deadlines with an index.
    vendor: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))  # rupees
    doc_date: Mapped[date | None] = mapped_column(Date)
    expiry_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    reference_masked: Mapped[str | None] = mapped_column(String(64))  # "●●●● 4821"
    # Per field (camelCase keys, as the UI uses): where it is on the page as % boxes
    # {"page","x","y","w","h"}, and how sure the reader was (0-1).
    field_boxes: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    confidence: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Which AI read it ("gemini:<models>"), so documents read on a free tier can be
    # found and re-read later, and evals can compare providers.
    read_by: Mapped[str | None] = mapped_column(String(128))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="documents")
    pages: Mapped[list["DocumentPage"]] = relationship(
        order_by="DocumentPage.page_no", viewonly=True
    )


class DocumentPage(Base):
    """One page of a document: its image in Storage (what the viewer shows) and its
    text, with ID numbers already masked."""

    __tablename__ = "document_pages"
    __table_args__ = (
        CheckConstraint(_in("text_source", TEXT_SOURCES), name="document_pages_text_source_check"),
    )

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    page_no: Mapped[int] = mapped_column(Integer, primary_key=True)  # 1-based
    # Copied from the document so row-level security can check it without a join.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    image_key: Mapped[str] = mapped_column(Text)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text, server_default="")
    text_source: Mapped[str] = mapped_column(String(16))


class Chunk(Base):
    """A passage of a page, the unit search works on. Each has an embedding (meaning)
    and a keyword index, and remembers where it sits on the page for highlights."""

    __tablename__ = "chunks"
    __table_args__ = (
        Index("ix_chunks_user", "user_id"),
        Index("ix_chunks_document", "document_id"),
        Index("ix_chunks_tsv", "tsv", postgresql_using="gin"),
        Index(
            "ix_chunks_embedding",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    page_no: Mapped[int] = mapped_column(Integer)
    ordinal: Mapped[int] = mapped_column(Integer)  # order within the document
    content: Mapped[str] = mapped_column(Text)
    box: Mapped[dict | None] = mapped_column(JSONB)  # % box on the page, if known
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMS))
    # Keyword index, kept up to date by Postgres itself. 'simple' = no English
    # stemming, so Hindi and Hinglish words are matched as written.
    tsv: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('simple', content)", persisted=True)
    )
