"""Small generated files for tests: no real documents in the repo."""

import io

from fpdf import FPDF
from PIL import Image, ImageDraw


def text_pdf(pages: list[list[str]]) -> bytes:
    """A PDF with a real text layer: one list of lines per page (A4)."""
    pdf = FPDF(format="A4")
    pdf.set_font("Helvetica", size=12)
    for lines in pages:
        pdf.add_page()
        for line in lines:
            pdf.cell(0, 10, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def scanned_pdf() -> bytes:
    """A PDF that is only a picture of a page (no text layer), like a scanner makes."""
    pdf = FPDF(format="A4")
    pdf.add_page()
    pdf.image(photo_image(), x=0, y=0, w=210)
    return bytes(pdf.output())


def photo_image(size=(900, 1200)) -> Image.Image:
    img = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(img)
    draw.text((50, 50), "RECEIPT  Total Rs. 499", fill="black")
    return img


def photo_jpeg(rotate_exif: bool = False, size=(900, 1200)) -> bytes:
    img = photo_image(size)
    out = io.BytesIO()
    if rotate_exif:
        exif = Image.Exif()
        exif[0x0112] = 6  # "rotate 90° clockwise to display", what phones write
        img.save(out, "JPEG", exif=exif)
    else:
        img.save(out, "JPEG")
    return out.getvalue()
