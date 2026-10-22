"""Hide ID numbers before text is stored, searched or sent to an AI model.

Answering "when does my policy end?" never needs a full Aadhaar or card number, so
we keep only the last 4 digits: "●●●● 4821". The original file in Storage is
untouched; only the text we derive from it is masked.

Checksums keep false alarms down: a random 12-digit invoice number is very unlikely
to pass Aadhaar's Verhoeff check, and a 16-digit order number rarely passes Luhn.
"""

import re

DOT = "●●●●"

# 12 digits, either 1234 5678 9012 / 1234-5678-9012 or run together. Aadhaar never
# starts with 0 or 1.
_AADHAAR = re.compile(r"(?<![\d-])([2-9]\d{3})[ -]?(\d{4})[ -]?(\d{4})(?![\d-])")
# PAN: 5 letters, 4 digits, 1 letter; the 4th letter is the holder type
# (P person, C company, H HUF, F firm, ...).
_PAN = re.compile(r"\b[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]\b")
# Card numbers: 13-19 digits, optionally in groups split by spaces or dashes.
_CARD = re.compile(r"(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])")

# An ID the AI already masked while reading a photo (its prompt asks it to).
_MASKED = re.compile(DOT + r" ?[0-9A-Za-z]{4}")
# The longest original a mask can stand for (a 19-digit card in groups of 4) is this
# many characters longer than the mask itself.
MAX_HIDDEN = len("4111 1111 1111 1111 111") - len(f"{DOT} 1111")

# Verhoeff tables (multiplication, permutation).
_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def verhoeff_ok(digits: str) -> bool:
    check = 0
    for i, ch in enumerate(reversed(digits)):
        check = _D[check][_P[i % 8][int(ch)]]
    return check == 0


def luhn_ok(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2:
            n = n * 2 - 9 if n > 4 else n * 2
        total += n
    return total % 10 == 0


def masked(last4: str) -> str:
    return f"{DOT} {last4}"


def id_spans(text: str) -> list[tuple[int, int]]:
    """(start, end) of every ID number in `text`, in order. `mask_ids` replaces
    exactly these, and the pipeline blurs the same spans on the page image, so the
    two can never disagree."""
    spans: list[tuple[int, int]] = []
    for pattern, ok in ((_AADHAAR, verhoeff_ok), (_CARD, luhn_ok), (_PAN, None)):
        # Blank out what's already found (same length, so positions hold) so a later
        # pattern can't match across an earlier one.
        seen = list(text)
        for start, end in spans:
            seen[start:end] = DOT[0] * (end - start)
        for m in pattern.finditer("".join(seen)):
            if ok is None or ok(re.sub(r"\D", "", m.group(0))):
                spans.append(m.span())
    return sorted(spans)


def masked_spans(text: str) -> list[tuple[int, int]]:
    """(start, end) of ID numbers that are already masked, like "●●●● 4821"."""
    return [m.span() for m in _MASKED.finditer(text)]


def mask_ids(text: str) -> str:
    out, at = [], 0
    for start, end in id_spans(text):
        out += [text[at:start], masked(re.sub(r"[ -]", "", text[start:end])[-4:])]
        at = end
    return "".join(out) + text[at:]
