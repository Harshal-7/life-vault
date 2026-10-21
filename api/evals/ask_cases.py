"""Questions about the fictional vault in evals/cases.py, with what a right answer must
contain. `docs` are case ids that should appear among the sources; `text` must all
appear in the fact card or the answer (₹ amounts as written by the app: ₹2,340.50).
`not_found` questions ask about things that aren't in the vault."""

from dataclasses import dataclass, field

TODAY = "2026-10-22"  # fixed, so "in 4 months" style answers don't drift


@dataclass
class Q:
    q: str
    kind: str  # date | amount | reference | content | total | missing
    docs: list[str] = field(default_factory=list)
    text: list[str] = field(default_factory=list)
    fact: str | None = None  # expected fact card value, if one should appear
    not_found: bool = False


QUESTIONS = [
    # Dates: the fast path (no AI router)
    Q(
        "When is my electricity bill due?",
        "date",
        ["brightgrid-bill"],
        ["25 Oct 2026"],
        fact="25 Oct 2026",
    ),
    Q(
        "When does my fridge warranty expire?",
        "date",
        ["coolwave-warranty"],
        ["2 Mar 2027"],
        fact="2 Mar 2027",
    ),
    Q(
        "mera washing machine warranty kab tak hai?",
        "date",
        ["spinwell-warranty-card"],
        ["13 Jan 2028"],
        fact="13 Jan 2028",
    ),
    Q(
        "When does my health insurance renew?",
        "date",
        ["suraksha-insurance"],
        ["14 Apr 2027"],
        fact="14 Apr 2027",
    ),
    Q(
        "When does my rent agreement end?",
        "date",
        ["rent-agreement"],
        ["30 Apr 2027"],
        fact="30 Apr 2027",
    ),
    Q(
        "Internet bill ki last date kya hai?",
        "date",
        ["skyfibre-bill"],
        ["12 Oct 2026"],
        fact="12 Oct 2026",
    ),
    Q("When is the phone bill due?", "date", ["phone-bill"], ["2 Nov 2026"], fact="2 Nov 2026"),
    Q(
        "paani ka bill kab bharna hai?",
        "date",
        ["water-bill-hinglish"],
        ["10 Nov 2026"],
        fact="10 Nov 2026",
    ),
    Q(
        "When did I buy the fridge?",
        "date",
        ["coolwave-warranty"],
        ["2 Mar 2025"],
        fact="2 Mar 2025",
    ),
    Q("What is my health policy number?", "reference", ["suraksha-insurance"], ["889214"]),
    # Amounts: the AI router decides which amount
    Q(
        "How much is my electricity bill?",
        "amount",
        ["brightgrid-bill"],
        ["2,340.50"],
        fact="₹2,340.50",
    ),
    Q(
        "What is my health insurance premium?",
        "amount",
        ["suraksha-insurance"],
        ["18,450"],
        fact="₹18,450",
    ),
    Q("How much is my monthly rent?", "amount", ["rent-agreement"], ["24,000"], fact="₹24,000"),
    Q("How much did I spend at Annapurna Stores?", "amount", ["grocery-receipt"], ["642"]),
    Q("Pharmacy bill kitna tha?", "amount", ["pharmacy-receipt"], ["385.50"]),
    Q("How much property tax did I pay?", "amount", ["property-tax"], ["8,200"]),
    # Content: the answer is in the text
    Q(
        "Does my health insurance cover dental treatment?",
        "content",
        ["suraksha-insurance"],
        ["accident"],
    ),
    Q(
        "What is the waiting period for pre-existing conditions?",
        "content",
        ["suraksha-insurance"],
        ["3 years"],
    ),
    Q("How much is the security deposit for the flat?", "content", ["rent-agreement"], ["72,000"]),
    Q(
        "How much notice do I need to give to end the rent agreement?",
        "content",
        ["rent-agreement"],
        ["one month"],
    ),
    Q("How many units of electricity did I use?", "content", ["brightgrid-bill"], ["214"]),
    Q(
        "Is the fridge compressor covered, and for how long?",
        "content",
        ["coolwave-warranty"],
        ["10 years"],
    ),
    Q(
        "Who pays the electricity and water charges for my flat?",
        "content",
        ["rent-agreement"],
        ["tenant"],
    ),
    Q("What speed is my internet plan?", "content", ["skyfibre-bill"], ["150"]),
    Q(
        "Which dealer sold my washing machine?",
        "content",
        ["spinwell-warranty-card"],
        ["City Electronics"],
    ),
    # Totals over several documents (bills dated in October 2026: 2,340.50 + 599 + 410)
    Q(
        "How much did I pay for bills in October 2026?",
        "total",
        ["brightgrid-bill", "phone-bill", "water-bill-hinglish"],
        ["3,349.50"],
    ),
    # Not in the vault
    Q("When does my car insurance expire?", "missing", not_found=True),
    Q("What is my passport number?", "missing", not_found=True),
    Q("When is my credit card bill due?", "missing", not_found=True),
    Q("What tyre pressure does my car's manual recommend?", "missing", not_found=True),
]
