"""Field lookups: answers that come straight from the extracted columns ("when does my
fridge warranty end?") rather than from searching text. Exact, instant, and the fact
card can point at the field's highlight box."""

from dataclasses import dataclass
from datetime import date

from app.ask.format import field_label, inr, long_date, relative_days
from app.ask.vault import VaultDoc

BOX_KEY = {  # DB column → the UI's field key (as stored in field_boxes)
    "vendor": "vendor",
    "amount": "amount",
    "doc_date": "docDate",
    "expiry_date": "expiryDate",
    "due_date": "dueDate",
    "reference": "referenceMasked",
}
MAX_ROWS = 15


@dataclass
class Fact:
    doc: VaultDoc
    column: str
    label: str
    value: str
    detail: str | None

    @property
    def box(self) -> dict | None:
        return self.doc.field_boxes.get(BOX_KEY[self.column])

    def event(self) -> dict:
        out = {"type": "fact", "label": self.label, "value": self.value}
        return out | ({"detail": self.detail} if self.detail else {})

    def source_text(self) -> str:
        extra = f" ({self.detail})" if self.detail else ""
        return f"{self.label}: {self.value}{extra}"


def make_fact(doc: VaultDoc, column: str, today: date) -> Fact | None:
    raw = doc.value(column)
    if raw is None:
        return None
    label = field_label(column, doc.doc_type)
    if isinstance(raw, date):
        value, detail = long_date(raw), relative_days((raw - today).days)
    elif column == "amount":
        value = inr(raw)
        detail = f"due {long_date(doc.due_date)}" if doc.due_date else None
    else:
        value, detail = str(raw), None
    return Fact(doc, column, label, value, f"{detail} · {doc.title}" if detail else doc.title)


def first_fact(column: str, ordered: list[VaultDoc], today: date) -> Fact | None:
    """The fact from the first document (in relevance order) that has this field."""
    for doc in ordered:
        fact = make_fact(doc, column, today)
        if fact:
            return fact
    return None


def matching_rows(
    column: str,
    docs: list[VaultDoc],
    today: date,
    doc_types: list[str],
    date_from: date | None,
    date_to: date | None,
) -> list[Fact]:
    """Several documents for questions about a period or a total ("what did I pay for
    bills in October?"): each becomes a numbered source the answer can add up."""
    out = []
    for doc in docs:
        if doc_types and doc.doc_type not in doc_types:
            continue
        when = doc.doc_date or doc.due_date or doc.expiry_date
        if date_from and (when is None or when < date_from):
            continue
        if date_to and (when is None or when > date_to):
            continue
        fact = make_fact(doc, column, today)
        if fact:
            out.append(fact)
    out.sort(key=lambda f: f.doc.doc_date or f.doc.due_date or date.min)
    return out[:MAX_ROWS]
