"""The person's documents as the Ask pipeline sees them: the extracted fields of every
readable document, plus a short numbered list for the router."""

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Document

MAX_LISTED = 150  # the router sees at most this many (newest first)


@dataclass
class VaultDoc:
    n: int  # number in the router's list (1-based)
    id: uuid.UUID
    doc_type: str
    title: str
    vendor: str | None
    amount: Decimal | None
    doc_date: date | None
    expiry_date: date | None
    due_date: date | None
    reference: str | None
    tags: list[str]
    field_boxes: dict

    def value(self, column: str):
        return self.reference if column == "reference" else getattr(self, column)

    def line(self) -> str:
        """[3] warranty · Coolwave fridge warranty · Coolwave · ends 2027-03-02"""
        parts = [f"[{self.n}] {self.doc_type}", self.title]
        if self.vendor:
            parts.append(self.vendor)
        if self.expiry_date:
            parts.append(f"ends {self.expiry_date}")
        elif self.due_date:
            parts.append(f"due {self.due_date}")
        elif self.doc_date:
            parts.append(f"dated {self.doc_date}")
        if self.tags:
            parts.append(", ".join(self.tags))
        return " · ".join(parts)


async def load_vault(session: AsyncSession, user_id: uuid.UUID) -> list[VaultDoc]:
    rows = await session.scalars(
        select(Document)
        .where(Document.user_id == user_id, Document.status.in_(("ready", "needs_review")))
        .order_by(Document.created_at.desc())
        .limit(MAX_LISTED)
    )
    return [
        VaultDoc(
            n=i,
            id=d.id,
            doc_type=d.doc_type or "other",
            title=d.title or d.original_filename,
            vendor=d.vendor,
            amount=d.amount,
            doc_date=d.doc_date,
            expiry_date=d.expiry_date,
            due_date=d.due_date,
            reference=d.reference_masked,
            tags=d.tags or [],
            field_boxes=d.field_boxes or {},
        )
        for i, d in enumerate(rows, start=1)
    ]


def vault_list(docs: list[VaultDoc]) -> str:
    return "\n".join(d.line() for d in docs)
