"""Twelve fictional documents with the answers we expect. All companies and people
are made up; nothing here is a real document. Real documents for private testing go
in evals/private/ (git-ignored).

Each case is drawn on the fly: typed PDFs with fpdf2, "photos" as tilted, slightly
blurred JPEGs. The fonts can't draw Devanagari, so Hindi is only in Roman script
(Hinglish labels); test Hindi script with real samples in evals/private/.
"""

from dataclasses import dataclass, field

from app.pipeline.mask import verhoeff_ok


def _aadhaar(first11: str) -> str:
    return next(first11 + d for d in "0123456789" if verhoeff_ok(first11 + d))


AADHAAR = _aadhaar("73412298105")  # passes the checksum, so it must be masked
AADHAAR_SPACED = f"{AADHAAR[:4]} {AADHAAR[4:8]} {AADHAAR[8:]}"


@dataclass
class Case:
    id: str
    kind: str  # "pdf" or "photo"
    pages: list[list[str]]
    doc_type: str
    # Expected field values; fields left out aren't scored.
    expect: dict = field(default_factory=dict)
    # Text that must never survive into anything we store (ID numbers).
    must_not_contain: list[str] = field(default_factory=list)


CASES = [
    Case(
        "brightgrid-bill",
        "pdf",
        [
            [
                "BrightGrid Power Ltd (fictional company - demo only)",
                "Electricity bill for October 2026",
                "Bill date: 01 Oct 2026",
                "Consumer no: 1100 4821",
                "Units used: 214 kWh",
                "Energy charges: Rs. 1,986.00",
                "Fixed charges: Rs. 354.50",
                "Amount due: Rs. 2,340.50",
                "Pay by: 25 Oct 2026",
            ]
        ],
        "bill",
        {
            "vendor": "BrightGrid",
            "amount": 2340.50,
            "doc_date": "2026-10-01",
            "due_date": "2026-10-25",
            "reference": "4821",
        },
    ),
    Case(
        "skyfibre-bill",
        "pdf",
        [
            [
                "SkyFibre Broadband (fictional)",
                "Invoice INV-2026-09-55120",
                "Account number: 5520007710",
                "Invoice date: 28/09/2026",
                "Plan: Fibre 150 Mbps, monthly",
                "Plan charges 1,000.00",
                "GST @18% 180.00",
                "Total payable: Rs. 1,180.00",
                "Due date: 12/10/2026",
            ]
        ],
        "bill",
        {
            "vendor": "SkyFibre",
            "amount": 1180.00,
            "doc_date": "2026-09-28",
            "due_date": "2026-10-12",
            "reference": "7710",
        },
    ),
    Case(
        "coolwave-warranty",
        "pdf",
        [
            [
                "Coolwave Appliances (fictional) - Warranty Certificate",
                "Product: Coolwave FrostFree 340L refrigerator",
                "Serial no: CW340-88213",
                "Date of purchase: 2 March 2025",
                "Invoice value: Rs. 38,990",
                "Warranty: 2 years comprehensive from the date of purchase.",
                "Compressor: 10 years.",
                "Keep this certificate with your invoice.",
            ]
        ],
        "warranty",
        # Expiry isn't printed: it has to be worked out (purchase + 2 years).
        {"vendor": "Coolwave", "doc_date": "2025-03-02", "expiry_date": "2027-03-02"},
    ),
    Case(
        "suraksha-insurance",
        "pdf",
        [
            [
                "Suraksha Health Insurance Co. (fictional)",
                "Policy Schedule - Family Floater",
                "Policy number: SHI/2026/889214",
                "Policyholder: A. Kumar",
                "Period of insurance: 15/04/2026 to 14/04/2027",
                "Sum insured: Rs. 10,00,000",
                "Annual premium (incl. GST): Rs. 18,450",
            ],
            [
                "Section 4: Exclusions",
                "Dental treatment is excluded unless due to an accident.",
                "Waiting period for pre-existing conditions: 3 years.",
                "Room rent limit: 1% of sum insured per day.",
            ],
        ],
        "insurance",
        {
            "vendor": "Suraksha",
            "amount": 18450,
            "doc_date": "2026-04-15",
            "expiry_date": "2027-04-14",
            "reference": "9214",
        },
    ),
    Case(
        "rent-agreement",
        "pdf",
        [
            [
                "RENTAL AGREEMENT (fictional sample)",
                "This agreement is made on 1 June 2026 between Meera Iyer (Landlord)",
                "and Rohan Das (Tenant) for flat 4B, Lakeview Residency, Navanagar.",
                "Term: 11 months, from 01-06-2026 to 30-04-2027.",
                "Monthly rent: Rs. 24,000 payable by the 5th of each month.",
                "Security deposit: Rs. 72,000 (refundable).",
            ],
            [
                "Clause 7: Either party may end this agreement with one month's notice.",
                "Clause 9: The tenant pays electricity and water charges.",
            ],
        ],
        "rent",
        {
            "vendor": "Meera Iyer",
            "amount": 24000,
            "doc_date": "2026-06-01",
            "expiry_date": "2027-04-30",
        },
    ),
    Case(
        "phone-bill",
        "pdf",
        [
            [
                "Nimbus Mobile (fictional)",
                "Postpaid bill",
                "Mobile number: 98XXXX6642",
                "Bill period: 15 Sep 2026 - 14 Oct 2026",
                "Bill date: 15 Oct 2026",
                "Plan 599 Unlimited",
                "Total amount due: Rs. 599.00",
                "Due date: 02 Nov 2026",
            ]
        ],
        "bill",
        {"vendor": "Nimbus", "amount": 599.00, "doc_date": "2026-10-15", "due_date": "2026-11-02"},
    ),
    Case(
        "property-tax",
        "pdf",
        [
            [
                "Navanagar Municipal Corporation (fictional)",
                "Property Tax Receipt 2026-27",
                "Receipt no: PT/26/004417",
                "Property ID: NV-W12-3390",
                "Date of payment: 31/07/2026",
                "Amount paid: Rs. 8,200.00 (Rupees Eight Thousand Two Hundred)",
                "Payment mode: UPI",
            ]
        ],
        "tax",
        {"vendor": "Navanagar", "amount": 8200, "doc_date": "2026-07-31"},
    ),
    Case(
        "grocery-receipt",
        "photo",
        [
            [
                "ANNAPURNA STORES",
                "(fictional shop)",
                "Date 18/10/2026  Time 19:42",
                "Atta 5kg           285.00",
                "Toor dal 1kg       162.00",
                "Milk 2L             120.00",
                "Biscuits            75.00",
                "TOTAL              642.00",
                "Paid by UPI  Thank you!",
            ]
        ],
        "receipt",
        {"vendor": "Annapurna", "amount": 642.00, "doc_date": "2026-10-18"},
    ),
    Case(
        "pharmacy-receipt",
        "photo",
        [
            [
                "SANJEEVANI PHARMACY",
                "(fictional)",
                "Bill No 7781   Dt: 05-10-2026",
                "Paracetamol 650 x15    45.00",
                "Vitamin D3 x8         210.50",
                "Cough syrup 100ml     130.00",
                "Net Amount Rs.        385.50",
            ]
        ],
        "medical",
        {"vendor": "Sanjeevani", "amount": 385.50, "doc_date": "2026-10-05"},
    ),
    Case(
        "water-bill-hinglish",
        "photo",
        [
            [
                "JAL SEVA NIGAM (fictional)",
                "Paani ka bill / Water bill",
                "Bill tithi (date): 20-10-2026",
                "Upbhokta sankhya (consumer no): 7703381",
                "Kul rashi (total): Rs. 410",
                "Antim tithi (last date): 10-11-2026",
            ]
        ],
        "bill",
        {
            "vendor": "Jal Seva",
            "amount": 410,
            "doc_date": "2026-10-20",
            "due_date": "2026-11-10",
            "reference": "3381",
        },
    ),
    Case(
        "spinwell-warranty-card",
        "photo",
        [
            [
                "SPINWELL",
                "Washing machine warranty card (fictional)",
                "Model: SW-8KG Front Load",
                "Purchase date: 14 Jan 2026",
                "Warranty valid till: 13 Jan 2028",
                "Dealer: City Electronics",
            ]
        ],
        "warranty",
        {"vendor": "Spinwell", "doc_date": "2026-01-14", "expiry_date": "2028-01-13"},
    ),
    Case(
        "gas-receipt-with-aadhaar",
        "photo",
        [
            [
                "AGNI GAS AGENCY (fictional)",
                "Cylinder refill receipt",
                "Date: 30/09/2026",
                f"Customer Aadhaar: {AADHAAR_SPACED}",
                "14.2 kg cylinder refill",
                "Amount: Rs. 1,105.00",
            ]
        ],
        "receipt",
        {"vendor": "Agni", "amount": 1105.00, "doc_date": "2026-09-30"},
        must_not_contain=[AADHAAR, AADHAAR_SPACED],
    ),
]
