"""Amounts, dates and labels exactly as the web app shows them (web/src/lib/format.ts
and web/src/lib/field-labels.ts), so a fact card reads the same as the fields panel."""

from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal

IST = timezone(timedelta(hours=5, minutes=30))
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def today_ist(now: datetime | None = None) -> date:
    return (now or datetime.now(UTC)).astimezone(IST).date()


def inr(amount: Decimal | float) -> str:
    """124500 → "₹1,24,500"; 1179.5 → "₹1,179.50" (Indian lakh/crore grouping)."""
    value = Decimal(str(amount)).quantize(Decimal("0.01"))
    rupees, paise = divmod(abs(value), 1)
    digits = str(int(rupees))
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    grouped = ",".join(([head] if head else []) + groups + [tail])
    sign = "-" if value < 0 else ""
    cents = "" if paise == 0 else f".{int(paise * 100):02d}"
    return f"{sign}₹{grouped}{cents}"


def long_date(d: date) -> str:
    """2027-03-12 → "12 Mar 2027" """
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def relative_days(days: int) -> str:
    """0 → "today", 12 → "in 12 days", -6 → "6 days ago", 95 → "in 3 months" """
    if days == 0:
        return "today"
    if days == 1:
        return "tomorrow"
    if days == -1:
        return "yesterday"
    n = abs(days)
    if n < 60:
        span = f"{n} days"
    elif n < 365:
        span = f"{round(n / 30)} months"
    else:
        years = round(n / 365 * 10) / 10
        years_text = f"{years:g}"
        span = f"{years_text} {'year' if years == 1 else 'years'}"
    return f"in {span}" if days > 0 else f"{span} ago"


def field_label(column: str, doc_type: str) -> str:
    """Same wording as fieldLabel() in web/src/lib/field-labels.ts."""
    match column:
        case "vendor":
            return {"rent": "Property", "insurance": "Insurer", "id": "Issued by"}.get(
                doc_type, "Company"
            )
        case "amount":
            return {
                "insurance": "Premium",
                "rent": "Monthly rent",
                "tax": "Refund",
                "bill": "Amount due",
            }.get(doc_type, "Amount paid")
        case "doc_date":
            if doc_type == "warranty":
                return "Purchase date"
            return "Start date" if doc_type in ("insurance", "rent") else "Date"
        case "expiry_date":
            return {"insurance": "Renewal date", "rent": "End date", "id": "Expiry date"}.get(
                doc_type, "Valid until"
            )
        case "due_date":
            return "Pay by"
        case _:  # reference
            return {"insurance": "Policy no.", "id": "Number", "bill": "Account no."}.get(
                doc_type, "Reference"
            )
