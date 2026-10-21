"""Extraction eval: how well each AI provider reads documents.

    uv run python -m evals.extract                  # every provider that has a key
    uv run python -m evals.extract --provider gemini
    uv run python -m evals.extract --only grocery-receipt

Runs the same steps as the worker (read pages → AI reads photos → mask IDs → extract
fields → find boxes) on the fictional cases in evals/cases.py, with no database or
storage, and scores the result. Each run is saved to evals/results/.
"""

import argparse
import asyncio
import io
import json
import time
from datetime import date
from pathlib import Path

from fpdf import FPDF
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from app.config import get_settings
from app.pipeline.read import read_file
from app.pipeline.run import understand
from app.providers.llm import ClaudeReader, Reader
from evals.cases import CASES, Case

RESULTS = Path(__file__).parent / "results"
FIELDS = ["doc_type", "vendor", "amount", "doc_date", "expiry_date", "due_date", "reference"]

# $ per million tokens (input, output). Claude: Anthropic's list prices. Gemini runs
# on the free tier here; add its paid prices from Google's pricing page to estimate.
PRICES = {
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00),
}


# --- Drawing the fictional documents ---


def make_pdf(pages: list[list[str]]) -> bytes:
    pdf = FPDF(format="A4")
    pdf.set_font("Helvetica", size=12)
    for lines in pages:
        pdf.add_page()
        for line in lines:
            pdf.cell(0, 10, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def make_photo(lines: list[str]) -> bytes:
    """A receipt-like page on a dark table, slightly tilted and soft, like a phone shot."""
    font = ImageFont.load_default(size=34)
    paper = Image.new("RGB", (900, 120 + 56 * len(lines)), (246, 241, 228))
    draw = ImageDraw.Draw(paper)
    for i, line in enumerate(lines):
        draw.text((50, 60 + 56 * i), line, fill=(35, 32, 30), font=font)
    tilted = paper.rotate(2.5, expand=True, fillcolor=(70, 62, 55), resample=Image.BICUBIC)
    photo = Image.new("RGB", (tilted.width + 160, tilted.height + 160), (70, 62, 55))
    photo.paste(tilted, (80, 80))
    photo = photo.filter(ImageFilter.GaussianBlur(0.8))
    out = io.BytesIO()
    photo.save(out, "JPEG", quality=72)
    return out.getvalue()


def make_file(case: Case) -> tuple[bytes, str]:
    if case.kind == "pdf":
        return make_pdf(case.pages), "application/pdf"
    return make_photo(case.pages[0]), "image/jpeg"


# --- Scoring ---


def got_values(extraction, fields) -> dict:
    cols = fields.columns
    return {
        "doc_type": extraction.doc_type,
        "vendor": cols.get("vendor"),
        "amount": float(cols["amount"]) if cols.get("amount") is not None else None,
        "doc_date": str(cols["doc_date"]) if cols.get("doc_date") else None,
        "expiry_date": str(cols["expiry_date"]) if cols.get("expiry_date") else None,
        "due_date": str(cols["due_date"]) if cols.get("due_date") else None,
        "reference": cols.get("reference_masked"),
    }


def correct(name: str, want, got) -> bool:
    if got is None:
        return False
    if name == "vendor":
        w, g = want.casefold(), got.casefold()
        return w in g or g in w
    if name == "amount":
        return abs(float(want) - got) < 0.51
    if name == "reference":
        return want in got
    return want == got


BOX_KEYS = {
    "vendor": "vendor",
    "amount": "amount",
    "doc_date": "docDate",
    "expiry_date": "expiryDate",
    "due_date": "dueDate",
    "reference": "referenceMasked",
}


async def run_case(case: Case, reader: Reader) -> dict:
    data, mime = make_file(case)
    pages = read_file(data, mime, get_settings().max_pages)
    started = time.perf_counter()
    try:
        extraction, fields = await understand(pages, reader, f"{case.id}.{case.kind}")
    except Exception as exc:  # a failed read scores zero, and the run carries on
        return {
            "id": case.id,
            "error": f"{type(exc).__name__}: {exc}"[:300],
            "seconds": round(time.perf_counter() - started, 1),
            "scores": {},
        }
    seconds = round(time.perf_counter() - started, 1)

    got = got_values(extraction, fields)
    want = {"doc_type": case.doc_type, **case.expect}
    scores = {name: correct(name, want[name], got[name]) for name in want}
    boxed = [k for k in case.expect if got.get(k) is not None and BOX_KEYS[k] in fields.boxes]
    found = [k for k in case.expect if got.get(k) is not None]
    stored = "\n".join(p.text for p in pages) + json.dumps(got, default=str)
    leaked = [s for s in case.must_not_contain if s in stored]
    return {
        "id": case.id,
        "kind": case.kind,
        "seconds": seconds,
        "scores": scores,
        "want": want,
        "got": got,
        "boxes": f"{len(boxed)}/{len(found)}",
        "boxed": len(boxed),
        "found": len(found),
        "leaked_ids": leaked,
        "title": extraction.title,
    }


def cost(usage) -> float | None:
    total = 0.0
    for model, (inp, out) in usage.by_model.items():
        if model not in PRICES:
            return None
        price_in, price_out = PRICES[model]
        total += inp / 1e6 * price_in + out / 1e6 * price_out
    return total


def report(provider: str, reader: Reader, results: list[dict]) -> dict:
    n = len(results)
    per_field = {}
    for name in FIELDS:
        scored = [r["scores"][name] for r in results if name in r["scores"]]
        if scored:
            per_field[name] = (sum(scored), len(scored))
    # A failed read counts as wrong on every field it should have had.
    for r in results:
        if r.get("error"):
            case = next(c for c in CASES if c.id == r["id"])
            for name in ["doc_type", *case.expect]:
                ok, total = per_field.get(name, (0, 0))
                per_field[name] = (ok, total + 1)
    right = sum(ok for ok, _ in per_field.values())
    total = sum(t for _, t in per_field.values())
    boxed = sum(r.get("boxed", 0) for r in results)
    found = sum(r.get("found", 0) for r in results)
    dollars = cost(reader.usage)

    print(f"\n=== {provider}: {reader.fast_model} (text) + {reader.smart_model} (photos) ===")
    print(f"Fields right: {right}/{total} ({right / total:.0%})")
    for name, (ok, t) in per_field.items():
        print(f"  {name:<12} {ok}/{t}")
    print(f"Highlight box found: {boxed}/{found} fields")
    print(f"Avg seconds per document: {sum(r['seconds'] for r in results) / n:.1f}")
    print(f"Tokens: {reader.usage.input_tokens:,} in / {reader.usage.output_tokens:,} out")
    if dollars is None:
        print("Cost: free tier here (add paid prices to PRICES to estimate)")
    else:
        print(f"Cost: ${dollars:.4f} total, ${dollars / n:.5f} per document")
    leaks = [r["id"] for r in results if r.get("leaked_ids")]
    print(f"ID numbers leaked: {leaks or 'none'}")
    for r in results:
        if r.get("error"):
            print(f"  ✗ {r['id']}: {r['error']}")
        else:
            wrong = [
                f"{k} (want {r['want'][k]!r}, got {r['got'][k]!r})"
                for k, ok in r["scores"].items()
                if not ok
            ]
            if wrong:
                print(f"  ✗ {r['id']}: " + "; ".join(wrong))
    return {
        "provider": provider,
        "models": [reader.fast_model, reader.smart_model],
        "date": str(date.today()),
        "fields_right": right,
        "fields_total": total,
        "per_field": per_field,
        "boxes": [boxed, found],
        "usage": reader.usage.by_model,
        "cost_usd": dollars,
        "cases": results,
    }


def readers(choice: str) -> list[tuple[str, Reader]]:
    s = get_settings()
    out = []
    if choice in ("gemini", "both"):
        if s.gemini_api_key:
            from app.providers.gemini import GeminiReader

            out.append(("gemini", GeminiReader()))
        else:
            print("Skipping Gemini: GEMINI_API_KEY not set")
    if choice in ("claude", "both"):
        if s.anthropic_api_key:
            out.append(("claude", ClaudeReader()))
        else:
            print("Skipping Claude: ANTHROPIC_API_KEY not set")
    return out


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--provider", choices=["gemini", "claude", "both"], default="both")
    parser.add_argument("--only", help="run one case by id")
    args = parser.parse_args()
    cases = [c for c in CASES if not args.only or c.id == args.only]

    RESULTS.mkdir(exist_ok=True)
    for provider, reader in readers(args.provider):
        results = []
        for case in cases:  # one at a time: free tiers allow few requests a minute
            results.append(await run_case(case, reader))
            print(".", end="", flush=True)
        summary = report(provider, reader, results)
        if not args.only:
            path = RESULTS / f"extract-{provider}-{date.today()}.json"
            path.write_text(json.dumps(summary, indent=2, default=str, ensure_ascii=False))
            print(
                f"Saved {path.relative_to(Path.cwd()) if path.is_relative_to(Path.cwd()) else path}"
            )


if __name__ == "__main__":
    asyncio.run(main())
