"""Database tables, defined as Python classes.

Alembic reads these classes to generate migrations, and the API uses them to query.
Statuses and sources are plain text with CHECK constraints instead of Postgres ENUM
types: adding a new value later is a one-line migration instead of an ALTER TYPE dance.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

DOCUMENT_SOURCES = ("upload", "camera", "email")
DOCUMENT_STATUSES = ("uploaded", "processing", "needs_review", "ready", "failed")


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

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="documents")
