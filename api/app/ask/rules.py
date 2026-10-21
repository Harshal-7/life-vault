"""The fast path: spot which field a question asks about without calling the AI.

Free-tier AI calls take ~5 s each, so a question like "when is my electricity bill
due?" shouldn't wait for an AI router: these rules see "due" → due_date, search finds
the bill, and the fact card can show straight away. Anything unclear (a time period,
a total, unusual wording) goes to the AI router instead. Tracker #40.
"""

import re

# Order matters: "how much is due" asks for an amount, not a date.
_FIELD_RULES: list[tuple[str, str]] = [
    (
        "amount",
        r"how much|amount|kitn[aei]|cost|price|premium|\bpaid\b|\brent\b(?! agreement)"
        r"|\btotal\b|\bkul\b|kya (bill|charge)",
    ),
    (
        "due_date",
        r"\bdue\b|last date|pay by|payment date|deadline|antim tithi|bharn[ae]"
        r"|jama kar",
    ),
    (
        "expiry_date",
        r"expir|valid (till|until|upto|up to)|\bvalidity\b|renew|khatam|kab tak"
        r"|end date|\bends?\b|warranty (kab|over|left)|\bkab (se )?khatam",
    ),
    (
        "doc_date",
        r"when did i (buy|purchase|pay|get)|purchase date|\bbought\b|kab kharid"
        r"|bill date|issued on|kab liya",
    ),
    ("reference", r"(policy|account|consumer|customer|connection) (no|number|num)\b|number kya"),
    (
        "vendor",
        r"who is (my )?(insurer|landlord|provider|company)|which (company|insurer|bank)"
        r"|kaun si company|kis company",
    ),
]

# Fields the fast path may answer. Amounts are left to the AI router: "how much is
# the security deposit?" is an amount question whose answer is in the text, not the
# document's main amount (the monthly rent).
FAST_FIELDS = {"expiry_date", "due_date", "doc_date", "reference"}

# A time period or a total means several documents: leave it to the AI router.
_PERIOD = re.compile(
    r"\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(tember)?"
    r"|oct(ober)?|nov(ember)?|dec(ember)?|this (year|month|week)|last (year|month|week)"
    r"|is (saal|mahine)|pichhle|20\d\d|all (my|the)|sab|altogether|in total|total of)\b",
    re.IGNORECASE,
)


def quick_field(question: str) -> tuple[str | None, bool]:
    """(field column or None, whether the question names a period or a total)."""
    q = question.casefold()
    field = next((f for f, pattern in _FIELD_RULES if re.search(pattern, q)), None)
    return field, bool(_PERIOD.search(q))


_STOP = {
    # English
    "a", "an", "the", "is", "are", "was", "were", "be", "my", "me", "i", "you", "your",
    "of", "to", "in", "on", "for", "and", "or", "with", "at", "by", "from", "what",
    "when", "where", "which", "who", "how", "much", "many", "does", "do", "did", "will",
    "can", "it", "its", "this", "that", "there", "have", "has", "had", "any", "some",
    "please", "tell", "show", "find",
    # Hinglish
    "mera", "meri", "mere", "ka", "ki", "ke", "kab", "kya", "hai", "hain", "ho", "hoga",
    "hogi", "tak", "se", "ko", "par", "aur",
}  # fmt: skip
# Latin letters, digits and the Devanagari block (Python's \w drops Hindi vowel signs).
_WORD = re.compile("[0-9a-z\u0900-\u097f]+")


def keyword_terms(text: str, limit: int = 12) -> list[str]:
    """Search words for Postgres keyword search: no stop words, no punctuation."""
    seen: list[str] = []
    for w in _WORD.findall(text.casefold()):
        if len(w) > 1 and w not in _STOP and w not in seen:
            seen.append(w)
    return seen[:limit]
