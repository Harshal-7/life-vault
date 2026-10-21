"""The extraction eval's own machinery, with a fake reader that knows the answers:
every case must draw, read and score perfectly, and no ID number may leak."""

from app.providers.llm import Extraction, FieldValue, SeenLine, Transcription, Usage
from evals.cases import CASES
from evals.extract import report, run_case


class OracleReader:
    """Transcribes photos from the case text and 'extracts' the expected answers,
    quoting them as printed so boxes can be found."""

    provider, fast_model, smart_model, max_concurrency = "oracle", "o-fast", "o-smart", 1

    def __init__(self):
        self.case = None
        self.usage = Usage()

    async def transcribe(self, image_jpeg):
        lines = self.case.pages[0]
        return Transcription(
            readable=True,
            lines=[SeenLine(text=t, x=5, y=5 + 6 * i, w=90, h=4) for i, t in enumerate(lines)],
        )

    async def extract(self, text, filename):
        want = self.case.expect

        def fv(name, printed=None):
            if name not in want:
                return FieldValue(value=None, as_printed=None, page=None, confidence=0)
            return FieldValue(value=str(want[name]), as_printed=printed, page=1, confidence=0.95)

        return Extraction(
            doc_type=self.case.doc_type,
            title=self.case.id,
            tags=[],
            vendor=fv("vendor", want.get("vendor")),
            amount=fv("amount"),
            doc_date=fv("doc_date"),
            expiry_date=fv("expiry_date"),
            due_date=fv("due_date"),
            reference=fv("reference", want.get("reference")),
        )


async def test_eval_scores_a_perfect_reader_as_perfect(capsys):
    reader = OracleReader()
    results = []
    for case in CASES:
        reader.case = case
        results.append(await run_case(case, reader))

    assert not [r for r in results if r.get("error")]
    assert all(all(r["scores"].values()) for r in results)
    assert all(r["leaked_ids"] == [] for r in results)  # the Aadhaar case got masked
    summary = report("oracle", reader, results)
    assert summary["fields_right"] == summary["fields_total"]
    assert summary["boxes"][0] > 0  # vendor/reference quoted as printed → boxes found
    assert "Fields right" in capsys.readouterr().out
