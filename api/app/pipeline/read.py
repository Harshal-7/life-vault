"""Step 1 of reading a document: turn the uploaded file into pages.

Each page gets:
- an image for the viewer (WebP, ~1200 px wide)
- its text, split into lines that remember where they sit on the page (% boxes, the
  same units the UI's highlight boxes use)
- for scans and photos, a smaller JPEG that Claude reads instead (they have no text
  layer to read directly)

Everything here is plain CPU work (no network), so it's easy to test with generated
files. The worker runs it in a thread so it doesn't block other jobs.
"""

import io
import threading
from dataclasses import dataclass, field

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener()  # lets Pillow open iPhone HEIC photos

PAGE_WIDTH = 1200  # viewer image width in px
PAGE_MAX_HEIGHT = 2400  # very long receipts get scaled down to this instead
VISION_LONG_EDGE = 1568  # Claude's sweet spot: bigger images are downscaled anyway
# A PDF page is a scan when it has almost no text but a picture covering most of it.
MIN_TEXT_CHARS = 20
MIN_IMAGE_COVER = 0.5
PDF_MIME = "application/pdf"

# PDFium (the PDF engine inside Chrome) must not be used from two threads at once.
_pdfium_lock = threading.Lock()


class ReadError(Exception):
    """A problem with the file itself. The message is shown to the user as is."""


@dataclass
class Box:
    """A rectangle in % of the page (0-100), top-left origin, like the UI's `Box`."""

    x: float
    y: float
    w: float
    h: float

    def union(self, other: "Box") -> "Box":
        x0, y0 = min(self.x, other.x), min(self.y, other.y)
        x1 = max(self.x + self.w, other.x + other.w)
        y1 = max(self.y + self.h, other.y + other.h)
        return Box(x0, y0, x1 - x0, y1 - y0)

    def as_dict(self, page_no: int) -> dict:
        return {"page": page_no, **{k: round(getattr(self, k), 2) for k in "xywh"}}


@dataclass
class Line:
    text: str
    box: Box


@dataclass
class Page:
    page_no: int  # 1-based
    image: bytes  # WebP for the viewer
    width: int
    height: int
    lines: list[Line] = field(default_factory=list)
    # Set when the page has no usable text layer: JPEG for Claude to read.
    vision_image: bytes | None = None

    @property
    def text(self) -> str:
        return "\n".join(line.text for line in self.lines)

    @property
    def needs_vision(self) -> bool:
        return self.vision_image is not None


def read_file(data: bytes, mime_type: str, max_pages: int) -> list[Page]:
    if mime_type == PDF_MIME:
        with _pdfium_lock:
            return _read_pdf(data, max_pages)
    return [_read_photo(data)]


# --- PDFs ---


def _read_pdf(data: bytes, max_pages: int) -> list[Page]:
    try:
        pdf = pdfium.PdfDocument(data)
    except pdfium.PdfiumError as exc:
        if "password" in str(exc).lower():
            raise ReadError("This PDF is password-protected. Upload an unlocked copy.") from exc
        raise ReadError("We couldn't open this PDF. It may be damaged.") from exc
    try:
        if len(pdf) == 0:
            raise ReadError("This PDF has no pages.")
        if len(pdf) > max_pages:
            raise ReadError(
                f"This PDF has {len(pdf)} pages. Life Vault reads up to {max_pages}; "
                "upload the pages that matter."
            )
        return [_read_pdf_page(pdf[i], i + 1) for i in range(len(pdf))]
    finally:
        pdf.close()


def _read_pdf_page(page: pdfium.PdfPage, page_no: int) -> Page:
    width_pt, height_pt = page.get_size()
    lines = _pdf_lines(page, width_pt, height_pt)
    is_scan = sum(len(line.text) for line in lines) < MIN_TEXT_CHARS and (
        _image_cover(page, width_pt * height_pt) >= MIN_IMAGE_COVER
    )

    scale = min(PAGE_WIDTH / width_pt, PAGE_MAX_HEIGHT / height_pt, 4.0)
    bitmap = page.render(scale=scale)
    image = bitmap.to_pil().convert("RGB")
    page.close()

    if is_scan:  # a few stray characters on a scan aren't worth keeping
        return Page(page_no, _webp(image), image.width, image.height, [], _vision_jpeg(image))
    return Page(page_no, _webp(image), image.width, image.height, lines)


def _image_cover(page: pdfium.PdfPage, page_area: float) -> float:
    """Share of the page covered by its largest picture (0-1)."""
    largest = 0.0
    for obj in page.get_objects(filter=[pdfium_c.FPDF_PAGEOBJ_IMAGE]):
        left, bottom, right, top = obj.get_bounds()
        largest = max(largest, (right - left) * (top - bottom))
    return min(largest / page_area, 1.0)


def _pdf_lines(page: pdfium.PdfPage, width_pt: float, height_pt: float) -> list[Line]:
    """Text runs with their boxes, merged into lines. PDF coordinates start at the
    bottom-left in points; the UI wants % from the top-left."""
    textpage = page.get_textpage()
    try:
        runs: list[Line] = []
        for i in range(textpage.count_rects()):
            left, bottom, right, top = textpage.get_rect(i)
            text = textpage.get_text_bounded(left, bottom, right, top).strip()
            if not text:
                continue
            box = Box(
                x=_pct(left, width_pt),
                y=_pct(height_pt - top, height_pt),
                w=_pct(right - left, width_pt),
                h=_pct(top - bottom, height_pt),
            )
            runs.append(Line(" ".join(text.split()), box))
    finally:
        textpage.close()
    return _merge_runs(runs)


def _merge_runs(runs: list[Line]) -> list[Line]:
    """PDFs often store one visual line as several runs (e.g. a label and a value in
    different fonts). Join runs that sit on the same line, left to right."""
    lines: list[Line] = []
    for run in runs:
        last = lines[-1] if lines else None
        if last and _same_line(last.box, run.box) and run.box.x >= last.box.x:
            last.text = f"{last.text} {run.text}"
            last.box = last.box.union(run.box)
        else:
            lines.append(Line(run.text, run.box))
    return lines


def _same_line(a: Box, b: Box) -> bool:
    centre_a, centre_b = a.y + a.h / 2, b.y + b.h / 2
    return abs(centre_a - centre_b) < max(min(a.h, b.h) / 2, 0.3)


def _pct(value: float, total: float) -> float:
    return max(0.0, min(100.0, value / total * 100))


# --- Photos ---


def _read_photo(data: bytes) -> Page:
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)  # phones store rotation separately
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise ReadError("We couldn't open this image. Try a JPEG or PNG photo.") from exc

    viewer = image.copy()
    viewer.thumbnail((PAGE_WIDTH, PAGE_MAX_HEIGHT))  # only ever shrinks
    return Page(
        page_no=1,
        image=_webp(viewer),
        width=viewer.width,
        height=viewer.height,
        vision_image=_vision_jpeg(image),
    )


# --- Encoding ---


def _webp(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, "WEBP", quality=80, method=4)
    return out.getvalue()


def _vision_jpeg(image: Image.Image) -> bytes:
    small = image.copy()
    small.thumbnail((VISION_LONG_EDGE, VISION_LONG_EDGE))
    out = io.BytesIO()
    small.save(out, "JPEG", quality=85)
    return out.getvalue()
