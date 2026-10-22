"""Turn Claude's extraction into clean column values, highlight boxes and a status.

Claude returns strings; the database wants dates and decimals. Anything that doesn't
parse is dropped rather than stored wrong. The UI calls the fields by camelCase keys
(`docDate`, `referenceMasked`...), so boxes and confidences use those keys too.
"""

import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

from app.pipeline.mask import mask_ids
from app.pipeline.read import Page
from app.providers.llm import Extraction, FieldValue

LOW_CONFIDENCE = 0.8  # same threshold the fields panel uses to flag "check this"

# Extraction attribute → (UI key, DB column)
FIELDS = {
    "vendor": ("vendor", "vendor"),
    "amount": ("amount", "amount"),
    "doc_date": ("docDate", "doc_date"),
    "expiry_date": ("expiryDate", "expiry_date"),
    "due_date": ("dueDate", "due_date"),
    "reference": ("referenceMasked", "reference_masked"),
}

# Without these the document isn't much use, so a missing one means "please check".
KEY_FIELDS = {
    "bill": ["vendor", "amount"],
    "warranty": ["vendor", "expiryDate"],
    "insurance": ["vendor", "expiryDate"],
    "rent": ["vendor", "expiryDate"],
}


@dataclass
class Fields:
    columns: dict = field(default_factory=dict)  # DB column → value
    boxes: dict = field(default_factory=dict)  # UI key → {"page","x","y","w","h"}
    confidence: dict = field(default_factory=dict)  # UI key → 0-1


def build_fields(extraction: Extraction, pages: list[Page]) -> Fields:
    out = Fields()
    for attr, (key, column) in FIELDS.items():
        fv: FieldValue = getattr(extraction, attr)
        value = _clean(column, fv.value)
        if value is None:
            continue
        out.columns[column] = value
        out.confidence[key] = round(max(0.0, min(1.0, fv.confidence)), 2)
        box = find_box(fv, pages)
        if box:
            out.boxes[key] = box
    return out


def needs_review(doc_type: str, fields: Fields) -> bool:
    missing = any(k not in fields.confidence for k in KEY_FIELDS.get(doc_type, ["vendor"]))
    unsure = any(c < LOW_CONFIDENCE for c in fields.confidence.values())
    return missing or unsure


def _clean(column: str, raw: str | None) -> object | None:
    if raw is None or not raw.strip():
        return None
    raw = raw.strip()
    if column == "amount":
        try:
            amount = Decimal(re.sub(r"[^\d.]", "", raw))
        except InvalidOperation:
            return None
        return amount if 0 < amount < Decimal("1e10") else None
    if column.endswith("_date"):
        try:
            return date.fromisoformat(raw)
        except ValueError:
            return None
    if column == "reference_masked":
        return mask_ids(raw)[:64]  # belt and braces: never store a full ID number
    return raw[:200]


# --- Highlight boxes ---


def _norm(text: str) -> str:
    return " ".join(text.casefold().split())


def find_box(fv: FieldValue, pages: list[Page]) -> dict | None:
    """Find where `as_printed` sits on the page and return a % box around it.

    The box within a line is estimated from the character position (`Box.sub`).
    Good enough to draw the eye; exact for values that fill the whole line."""
    if not fv.as_printed:
        return None
    needle = _norm(fv.as_printed)
    if not needle:
        return None
    # Look on the page Claude named first, then everywhere else.
    ordered = sorted(pages, key=lambda p: p.page_no != fv.page)
    for page in ordered:
        for line in page.lines:
            hay = _norm(line.text)
            at = hay.find(needle)
            if at < 0:
                continue
            start, end = at / len(hay), (at + len(needle)) / len(hay)
            box = line.box.sub(start, end, pad=0.4)  # a little air around the text
            return box.as_dict(page.page_no)
    return None
