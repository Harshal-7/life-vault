"""Shapes the API sends and receives. JSON uses camelCase to match the web app's
TypeScript types (web/src/lib/data/types.ts)."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

DocType = Literal[
    "bill", "receipt", "warranty", "insurance", "rent", "medical", "tax", "id", "manual", "other"
]
DocSource = Literal["upload", "camera", "email"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class DocumentOut(CamelModel):
    id: uuid.UUID
    title: str
    doc_type: DocType
    status: str
    source: DocSource
    original_filename: str
    size_bytes: int
    mime_type: str
    page_count: int = 0
    thumbnail_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    error: str | None = None


class DocumentDetailOut(DocumentOut):
    # Filled by the ingestion pipeline in M1; empty until then.
    fields: dict = Field(default_factory=dict)
    field_boxes: dict = Field(default_factory=dict)
    confidence: dict = Field(default_factory=dict)
    pages: list[dict] = Field(default_factory=list)
    file_url: str | None = None


class UploadIn(CamelModel):
    filename: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)
    mime_type: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source: DocSource = "upload"


class UploadOut(CamelModel):
    document: DocumentOut
    upload_url: str


class DocumentPatch(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    doc_type: DocType | None = None
