import io

import pytest
from PIL import Image

from app.pipeline.read import PAGE_WIDTH, VISION_LONG_EDGE, ReadError, read_file
from tests.factories import photo_jpeg, scanned_pdf, text_pdf

PDF = "application/pdf"


def test_text_pdf_gives_lines_with_boxes_and_page_images():
    data = text_pdf([["Coolwave Electric", "Amount due: Rs. 2,340.00"], ["Page two terms"]])
    pages = read_file(data, PDF, max_pages=50)

    assert [p.page_no for p in pages] == [1, 2]
    first = pages[0]
    assert first.lines[1].text == "Amount due: Rs. 2,340.00"
    assert not first.needs_vision
    # Lines run top to bottom, inside the page, in % units.
    a, b = first.lines[0].box, first.lines[1].box
    assert 0 < a.y < b.y < 100 and 0 < a.x < 50 and 0 < b.w < 100
    # Viewer image is WebP at ~1200 px wide with A4 proportions.
    img = Image.open(io.BytesIO(first.image))
    assert img.format == "WEBP" and (first.width, first.height) == img.size
    assert abs(first.width - PAGE_WIDTH) <= 1 and 1.3 < first.height / first.width < 1.5
    assert pages[1].text == "Page two terms"


def test_scanned_pdf_is_sent_to_vision():
    [page] = read_file(scanned_pdf(), PDF, max_pages=50)
    assert page.needs_vision and page.lines == []
    assert Image.open(io.BytesIO(page.vision_image)).format == "JPEG"


def test_photo_is_turned_upright_and_shrunk():
    [page] = read_file(photo_jpeg(rotate_exif=True, size=(3000, 2000)), "image/jpeg", 50)
    # Stored landscape with a "rotate 90°" tag → upright portrait.
    assert page.height > page.width
    vision = Image.open(io.BytesIO(page.vision_image))
    assert max(vision.size) == VISION_LONG_EDGE


def test_too_many_pages_is_a_friendly_error():
    with pytest.raises(ReadError, match="reads up to 2"):
        read_file(text_pdf([["a"], ["b"], ["c"]]), PDF, max_pages=2)


def test_broken_files_are_friendly_errors():
    with pytest.raises(ReadError, match="couldn't open this PDF"):
        read_file(b"%PDF-1.7 not really", PDF, max_pages=50)
    with pytest.raises(ReadError, match="couldn't open this image"):
        read_file(b"not an image", "image/png", max_pages=50)
