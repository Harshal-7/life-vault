from datetime import date
from decimal import Decimal

from app.pipeline.chunk import CHUNK_CHARS, chunk_pages, embedding_header
from app.pipeline.fields import build_fields, find_box, needs_review
from app.pipeline.read import Box, Line, Page
from app.providers.llm import Extraction, FieldValue

NONE = FieldValue(value=None, as_printed=None, page=None, confidence=0)


def fv(value, printed=None, page=1, confidence=0.95):
    return FieldValue(value=value, as_printed=printed, page=page, confidence=confidence)


def page(lines: list[str], page_no=1) -> Page:
    """Lines stacked down the page, each 80% wide and 2% tall."""
    return Page(
        page_no,
        b"",
        1200,
        1700,
        [Line(t, Box(10, 10 + i * 3, 80, 2)) for i, t in enumerate(lines)],
    )


def extraction(**fields) -> Extraction:
    base = dict(
        vendor=NONE, amount=NONE, doc_date=NONE, expiry_date=NONE, due_date=NONE, reference=NONE
    )
    return Extraction(doc_type="bill", title="SkyFibre internet bill", tags=[], **(base | fields))


def test_values_are_cleaned_and_bad_ones_dropped():
    pages = [page(["SkyFibre Broadband", "Total due Rs. 1,180.00", "Pay by 2025-11-05"])]
    f = build_fields(
        extraction(
            vendor=fv("SkyFibre", "SkyFibre"),
            amount=fv("1,180.00", "Rs. 1,180.00"),
            due_date=fv("2025-11-05", "2025-11-05"),
            doc_date=fv("sometime in October"),  # not a date → dropped
            reference=fv("ABCPE1234F"),  # a full PAN would be masked
        ),
        pages,
    )
    assert f.columns == {
        "vendor": "SkyFibre",
        "amount": Decimal("1180.00"),
        "due_date": date(2025, 11, 5),
        "reference_masked": "●●●● 234F",
    }
    assert set(f.confidence) == {"vendor", "amount", "dueDate", "referenceMasked"}
    assert not needs_review("bill", f)


def test_box_is_found_inside_its_line():
    pages = [page(["Header"]), page(["Something", "Total due Rs. 1,180.00"], page_no=2)]
    box = find_box(fv("1180", "rs. 1,180.00", page=2), pages)
    assert box["page"] == 2
    line = pages[1].lines[1].box
    # "Rs. 1,180.00" is the last 12 of the line's 22 characters: the box covers
    # roughly that share of the line, ends at its right edge and sits on its row.
    assert line.x + line.w * 0.4 < box["x"] < line.x + line.w * 0.5
    assert abs(box["x"] + box["w"] - (line.x + line.w)) < 1
    assert abs(box["y"] - line.y) < 1
    assert find_box(fv("1", "not on any page"), pages) is None


def test_review_when_key_field_missing_or_unsure():
    pages = [page(["x"])]
    missing_amount = build_fields(extraction(vendor=fv("SkyFibre")), pages)
    assert needs_review("bill", missing_amount)
    unsure = build_fields(extraction(vendor=fv("SkyFibre"), amount=fv("10", confidence=0.6)), pages)
    assert needs_review("bill", unsure)


def test_chunks_stay_on_their_page_and_overlap():
    long_lines = [f"Clause {i}: " + "terms apply " * 12 for i in range(30)]
    chunks = chunk_pages([page(long_lines), page(["Short page"], page_no=2)])
    first_page = [c for c in chunks if c.page_no == 1]
    assert len(first_page) > 1
    assert all(len(c.content) <= CHUNK_CHARS + 200 for c in first_page)
    # The next chunk starts with the previous chunk's last line.
    assert first_page[1].content.splitlines()[0] == first_page[0].content.splitlines()[-1]
    assert chunks[-1].page_no == 2 and chunks[-1].content == "Short page"
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))
    assert chunks[-1].box["page"] == 2


def test_embedding_header():
    assert embedding_header("warranty", "Coolwave fridge warranty", "Coolwave") == (
        "Warranty · Coolwave fridge warranty · Coolwave\n"
    )
