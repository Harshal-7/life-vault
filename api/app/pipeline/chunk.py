"""Split pages into passages ("chunks") for search.

Chunks never cross pages, so every search hit can point at one page and a box on it.
Neighbouring chunks share a little text (overlap) so a sentence cut at the boundary
still appears whole in one of them.
"""

from dataclasses import dataclass

from app.pipeline.read import Box, Page

CHUNK_CHARS = 1600  # ~400 tokens: big enough for context, small enough to be precise
OVERLAP_CHARS = 240  # ~15%


@dataclass
class TextChunk:
    page_no: int
    ordinal: int
    content: str
    box: dict | None


def chunk_pages(pages: list[Page]) -> list[TextChunk]:
    chunks: list[TextChunk] = []
    for page in pages:
        current: list = []  # lines in the chunk being built
        size = 0
        for line in page.lines:
            if current and size + len(line.text) > CHUNK_CHARS:
                chunks.append(_make(page.page_no, len(chunks), current))
                current = _tail(current)
                size = sum(len(x.text) + 1 for x in current)
            current.append(line)
            size += len(line.text) + 1
        if current:
            chunks.append(_make(page.page_no, len(chunks), current))
    return chunks


def _tail(lines: list) -> list:
    """The last few lines, up to OVERLAP_CHARS, to start the next chunk with (never
    all of them, or a run of tiny lines would repeat forever)."""
    tail, size = [], 0
    for line in reversed(lines[1:]):
        if size + len(line.text) > OVERLAP_CHARS:
            break
        tail.insert(0, line)
        size += len(line.text) + 1
    return tail


def _make(page_no: int, ordinal: int, lines: list) -> TextChunk:
    box: Box = lines[0].box
    for line in lines[1:]:
        box = box.union(line.box)
    content = "\n".join(line.text for line in lines)
    return TextChunk(page_no, ordinal, content, box.as_dict(page_no))


def embedding_header(doc_type: str, title: str, vendor: str | None) -> str:
    """Prepended to each chunk before embedding (not stored), so a passage like
    "Coverage: compressor, 10 years" still knows it's from the Coolwave fridge
    warranty. A cheap, well-known retrieval boost."""
    parts = [doc_type.capitalize(), title] + ([vendor] if vendor else [])
    return " · ".join(parts) + "\n"
