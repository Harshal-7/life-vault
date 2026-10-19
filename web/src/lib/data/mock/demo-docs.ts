/**
 * Fake documents for demo mode. All vendors are fictional and every number is made up.
 *
 * Dates are relative to today, so "expires in 12 days" stays true whenever you run the
 * demo. Page images are drawn on request as SVG (see app/demo-pages/[id]/[page]/route.ts)
 * from the same definitions, so citation highlights always land on the right text.
 */

import { addDays, formatDate, formatINR, todayISO } from "@/lib/format";

import type { Box, DocFields, DocSource, DocStatus, DocType, FieldKey } from "../types";

// --- Page building blocks ---------------------------------------------------

type Block =
  | { t: "title"; text: string }
  | { t: "text"; text: string; muted?: boolean }
  | { t: "row"; label: string; value: string; field?: FieldKey }
  | { t: "total"; label: string; value: string; field?: FieldKey }
  | { t: "para"; lines: string[]; cite?: string }
  | { t: "gap" };

export type DemoDoc = {
  id: string;
  title: string;
  docType: DocType;
  vendor?: string;
  accent: string; // header colour on the drawn page
  filename: string;
  source: DocSource;
  status: DocStatus;
  createdDaysAgo: number;
  tags: string[];
  fields: DocFields;
  confidence?: Partial<Record<FieldKey, number>>;
  error?: string;
  pages: Block[][];
  /** For documents that start as "processing": what they become once read. */
  finished?: { title: string; docType: DocType };
  /** Text passages answers can cite, by name, with the page they're on. */
  passages?: Record<string, { page: number; text: string }>;
};

export const PAGE_W = 600;
export const PAGE_H = 840;

const rel = (days: number) => addDays(todayISO(), days);
const monthName = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

// --- The documents ------------------------------------------------------------

export function buildDemoDocs(): DemoDoc[] {
  const fridgeBought = rel(-420);
  const elec = [
    { id: "doc-elec-1", date: rel(-65), amount: 2340, units: 312, due: rel(-50) },
    { id: "doc-elec-2", date: rel(-35), amount: 2710, units: 361, due: rel(-20) },
    { id: "doc-elec-3", date: rel(-5), amount: 1980, units: 264, due: rel(5) },
  ];
  const broadband = { date: rel(-9), due: rel(3) };

  const docs: DemoDoc[] = [
    {
      id: "doc-fridge-invoice",
      title: "Coolwave fridge invoice",
      docType: "receipt",
      vendor: "Coolwave Appliances",
      accent: "#0e7490",
      filename: "coolwave-invoice.pdf",
      source: "email",
      status: "ready",
      createdDaysAgo: 418,
      tags: ["fridge", "kitchen", "appliance"],
      fields: { vendor: "Coolwave Appliances", amount: 42990, docDate: fridgeBought },
      pages: [
        [
          { t: "title", text: "Tax invoice" },
          { t: "row", label: "Invoice no.", value: "CW/24/88213" },
          { t: "row", label: "Invoice date", value: formatDate(fridgeBought), field: "docDate" },
          { t: "gap" },
          { t: "row", label: "Item", value: "Coolwave FrostFree 340 L" },
          { t: "row", label: "Model", value: "CW-FF340" },
          { t: "row", label: "Serial no.", value: "●●●● 7731" },
          { t: "row", label: "Quantity", value: "1" },
          { t: "gap" },
          { t: "row", label: "Taxable value", value: formatINR(36432) },
          { t: "row", label: "GST @ 18%", value: formatINR(6558) },
          { t: "total", label: "Total paid", value: formatINR(42990), field: "amount" },
          { t: "gap" },
          { t: "text", text: "Paid by UPI. Thank you for shopping with Coolwave.", muted: true },
        ],
      ],
    },
    {
      id: "doc-fridge-warranty",
      title: "Coolwave fridge warranty",
      docType: "warranty",
      vendor: "Coolwave Appliances",
      accent: "#0e7490",
      filename: "coolwave-warranty-card.pdf",
      source: "upload",
      status: "ready",
      createdDaysAgo: 417,
      tags: ["fridge", "kitchen", "appliance"],
      fields: {
        vendor: "Coolwave Appliances",
        docDate: fridgeBought,
        expiryDate: rel(145),
        referenceMasked: "●●●● 7731",
      },
      pages: [
        [
          { t: "title", text: "Warranty card" },
          { t: "row", label: "Product", value: "Coolwave FrostFree 340 L" },
          { t: "row", label: "Serial no.", value: "●●●● 7731", field: "referenceMasked" },
          { t: "row", label: "Date of purchase", value: formatDate(fridgeBought), field: "docDate" },
          { t: "row", label: "Standard warranty", value: "1 year" },
          { t: "row", label: "Extended warranty", value: "+ 7 months (offer)" },
          { t: "total", label: "Warranty valid until", value: formatDate(rel(145)), field: "expiryDate" },
          { t: "gap" },
          { t: "text", text: "Keep this card and your invoice for any service request.", muted: true },
        ],
        [
          { t: "title", text: "What's covered" },
          {
            t: "para",
            cite: "coverage",
            lines: [
              "This warranty covers the compressor, cooling system and",
              "electrical parts against manufacturing defects. It does not",
              "cover glass shelves, bulbs, plastic parts, or damage caused",
              "by voltage fluctuation or improper installation.",
            ],
          },
          { t: "gap" },
          { t: "title", text: "How to claim" },
          {
            t: "para",
            cite: "claim",
            lines: [
              "Call 1800-000-0000 (demo number) or book a visit on the",
              "Coolwave app. Share the serial number and invoice date.",
            ],
          },
        ],
      ],
      passages: {
        coverage: {
          page: 2,
          text: "Covers the compressor, cooling system and electrical parts against manufacturing defects. Doesn't cover glass shelves, bulbs, plastic parts, or damage from voltage fluctuation.",
        },
        claim: {
          page: 2,
          text: "Call the service line or book a visit in the app, with the serial number and invoice date.",
        },
      },
    },
    {
      id: "doc-washer-warranty",
      title: "Spinwell washing machine warranty",
      docType: "warranty",
      vendor: "Spinwell Home",
      accent: "#7c3aed",
      filename: "spinwell-warranty.pdf",
      source: "email",
      status: "ready",
      createdDaysAgo: 352,
      tags: ["washing machine", "appliance"],
      fields: { vendor: "Spinwell Home", docDate: rel(-353), expiryDate: rel(12) },
      pages: [
        [
          { t: "title", text: "Warranty certificate" },
          { t: "row", label: "Product", value: "Spinwell 7 kg front load" },
          { t: "row", label: "Model", value: "SW-FL7" },
          { t: "row", label: "Installed on", value: formatDate(rel(-353)), field: "docDate" },
          { t: "row", label: "Warranty period", value: "1 year (motor: 5 years)" },
          { t: "total", label: "Warranty ends", value: formatDate(rel(12)), field: "expiryDate" },
          { t: "gap" },
          { t: "text", text: "Extend before expiry for ₹1,499/year.", muted: true },
        ],
      ],
    },
    {
      id: "doc-health-policy",
      title: "Suraksha Health family policy",
      docType: "insurance",
      vendor: "Suraksha Health Insurance",
      accent: "#0369a1",
      filename: "suraksha-policy-schedule.pdf",
      source: "email",
      status: "ready",
      createdDaysAgo: 344,
      tags: ["health", "family", "policy"],
      fields: {
        vendor: "Suraksha Health Insurance",
        amount: 18450,
        docDate: rel(-345),
        expiryDate: rel(20),
        referenceMasked: "●●●● 4821",
      },
      pages: [
        [
          { t: "title", text: "Policy schedule: family floater" },
          { t: "row", label: "Policy no.", value: "●●●● 4821", field: "referenceMasked" },
          { t: "row", label: "Insured members", value: "4 (2 adults, 2 children)" },
          { t: "row", label: "Sum insured", value: formatINR(500000) },
          { t: "row", label: "Policy start", value: formatDate(rel(-345)), field: "docDate" },
          { t: "row", label: "Renewal due", value: formatDate(rel(20)), field: "expiryDate" },
          { t: "total", label: "Annual premium", value: formatINR(18450), field: "amount" },
          { t: "gap" },
          { t: "text", text: "Cashless at 9,000+ network hospitals (demo).", muted: true },
        ],
        [
          { t: "title", text: "Section 4: What's covered" },
          {
            t: "para",
            cite: "room",
            lines: [
              "4.1 Hospital room rent is covered up to 1% of the sum",
              "insured per day. ICU charges are covered in full.",
            ],
          },
          {
            t: "para",
            cite: "dental",
            lines: [
              "4.2 Dental treatment is covered only when it is needed",
              "because of an accident and requires hospitalisation of at",
              "least 24 hours. Routine check-ups, cleaning, braces and",
              "cosmetic dental work are not covered.",
            ],
          },
          {
            t: "para",
            cite: "maternity",
            lines: [
              "4.3 Maternity expenses are covered up to ₹50,000 after a",
              "waiting period of 3 years from the first policy start.",
            ],
          },
        ],
      ],
      passages: {
        dental: {
          page: 2,
          text: "Dental treatment is covered only when it's needed because of an accident and requires hospitalisation of at least 24 hours. Routine check-ups, cleaning, braces and cosmetic work are not covered.",
        },
        room: {
          page: 2,
          text: "Room rent is covered up to 1% of the sum insured per day; ICU charges are covered in full.",
        },
        maternity: {
          page: 2,
          text: "Maternity is covered up to ₹50,000 after a 3-year waiting period.",
        },
      },
    },
    {
      id: "doc-car-insurance",
      title: "Gaadi Motor car insurance",
      docType: "insurance",
      vendor: "Gaadi General Insurance",
      accent: "#b45309",
      filename: "gaadi-motor-policy.pdf",
      source: "upload",
      status: "ready",
      createdDaysAgo: 371,
      tags: ["car", "vehicle", "policy"],
      fields: {
        vendor: "Gaadi General Insurance",
        amount: 11240,
        docDate: rel(-371),
        expiryDate: rel(-6),
        referenceMasked: "●●●● 0937",
      },
      pages: [
        [
          { t: "title", text: "Motor insurance certificate" },
          { t: "row", label: "Policy no.", value: "●●●● 0937", field: "referenceMasked" },
          { t: "row", label: "Vehicle", value: "Hatchback, petrol (MH-12 ●● ●●●●)" },
          { t: "row", label: "Cover", value: "Comprehensive + zero depreciation" },
          { t: "row", label: "Valid from", value: formatDate(rel(-371)), field: "docDate" },
          { t: "row", label: "Valid until", value: formatDate(rel(-6)), field: "expiryDate" },
          { t: "total", label: "Premium paid", value: formatINR(11240), field: "amount" },
        ],
      ],
    },
    {
      id: "doc-rent-agreement",
      title: "Rent agreement, Flat 302",
      docType: "rent",
      vendor: "Sunrise Apartments",
      accent: "#6d28d9",
      filename: "rent-agreement-flat-302.pdf",
      source: "upload",
      status: "ready",
      createdDaysAgo: 300,
      tags: ["home", "rent", "agreement"],
      fields: { vendor: "Sunrise Apartments", amount: 28000, docDate: rel(-305), expiryDate: rel(30) },
      pages: [
        [
          { t: "title", text: "Leave and licence agreement" },
          { t: "row", label: "Property", value: "Flat 302, Sunrise Apartments, Pune" },
          { t: "row", label: "Licensor", value: "R. Kulkarni (demo)" },
          { t: "row", label: "Start date", value: formatDate(rel(-305)), field: "docDate" },
          { t: "row", label: "End date", value: formatDate(rel(30)), field: "expiryDate" },
          { t: "total", label: "Monthly rent", value: formatINR(28000), field: "amount" },
          { t: "row", label: "Security deposit", value: formatINR(84000) },
          { t: "gap" },
          {
            t: "para",
            cite: "notice",
            lines: [
              "Either party may end this agreement with one month's written",
              "notice. The deposit is refunded within 15 days of handing",
              "over the keys, after deducting unpaid dues if any.",
            ],
          },
        ],
      ],
      passages: {
        notice: {
          page: 1,
          text: "Either party can end the agreement with one month's written notice. The ₹84,000 deposit is refunded within 15 days of handing over the keys.",
        },
      },
    },
    ...elec.map(
      (bill, i): DemoDoc => ({
        id: bill.id,
        title: `BrightGrid electricity, ${monthName(bill.date)}`,
        docType: "bill",
        vendor: "BrightGrid Power",
        accent: "#ca8a04",
        filename: `brightgrid-bill-${i + 1}.pdf`,
        source: "email",
        status: "ready",
        createdDaysAgo: Math.abs(daysFromToday(bill.date)) - 1,
        tags: ["electricity", "utility", "home"],
        fields: {
          vendor: "BrightGrid Power",
          amount: bill.amount,
          docDate: bill.date,
          dueDate: bill.due,
          referenceMasked: "●●●● 5512",
        },
        pages: [
          [
            { t: "title", text: "Electricity bill" },
            { t: "row", label: "Consumer no.", value: "●●●● 5512", field: "referenceMasked" },
            { t: "row", label: "Bill date", value: formatDate(bill.date), field: "docDate" },
            { t: "row", label: "Units consumed", value: `${bill.units} kWh` },
            { t: "row", label: "Energy charges", value: formatINR(Math.round(bill.amount * 0.82)) },
            { t: "row", label: "Fixed + other charges", value: formatINR(bill.amount - Math.round(bill.amount * 0.82)) },
            { t: "total", label: "Amount payable", value: formatINR(bill.amount), field: "amount" },
            { t: "row", label: "Pay by", value: formatDate(bill.due), field: "dueDate" },
          ],
        ],
      }),
    ),
    {
      id: "doc-broadband",
      title: `SkyFibre broadband, ${monthName(broadband.date)}`,
      docType: "bill",
      vendor: "SkyFibre Internet",
      accent: "#2563eb",
      filename: "skyfibre-bill.pdf",
      source: "email",
      status: "ready",
      createdDaysAgo: 8,
      tags: ["internet", "utility", "home"],
      fields: {
        vendor: "SkyFibre Internet",
        amount: 1179,
        docDate: broadband.date,
        dueDate: broadband.due,
      },
      pages: [
        [
          { t: "title", text: "Broadband bill" },
          { t: "row", label: "Plan", value: "Fibre 150 Mbps, unlimited" },
          { t: "row", label: "Bill date", value: formatDate(broadband.date), field: "docDate" },
          { t: "row", label: "Plan charges", value: formatINR(999) },
          { t: "row", label: "GST @ 18%", value: formatINR(180) },
          { t: "total", label: "Amount payable", value: formatINR(1179), field: "amount" },
          { t: "row", label: "Pay by", value: formatDate(broadband.due), field: "dueDate" },
        ],
      ],
    },
    {
      id: "doc-laptop-warranty",
      title: "Lumen laptop warranty",
      docType: "warranty",
      vendor: "Lumen Computers",
      accent: "#475569",
      filename: "lumen-warranty.pdf",
      source: "upload",
      status: "ready",
      createdDaysAgo: 319,
      tags: ["laptop", "electronics"],
      fields: { vendor: "Lumen Computers", docDate: rel(-320), expiryDate: rel(410) },
      pages: [
        [
          { t: "title", text: "Warranty registration" },
          { t: "row", label: "Product", value: "Lumen Air 14" },
          { t: "row", label: "Purchased on", value: formatDate(rel(-320)), field: "docDate" },
          { t: "row", label: "Plan", value: "2 years + accidental damage" },
          { t: "total", label: "Covered until", value: formatDate(rel(410)), field: "expiryDate" },
        ],
      ],
    },
    {
      id: "doc-phone-receipt",
      title: "Nimbus N7 phone receipt",
      docType: "receipt",
      vendor: "Nimbus Mobile Store",
      accent: "#0f766e",
      filename: "nimbus-n7-receipt.jpg",
      source: "camera",
      status: "ready",
      createdDaysAgo: 79,
      tags: ["phone", "electronics"],
      fields: { vendor: "Nimbus Mobile Store", amount: 34999, docDate: rel(-80) },
      pages: [
        [
          { t: "title", text: "Cash memo" },
          { t: "row", label: "Item", value: "Nimbus N7, 8 GB / 256 GB" },
          { t: "row", label: "IMEI", value: "●●●● 2290" },
          { t: "row", label: "Date", value: formatDate(rel(-80)), field: "docDate" },
          { t: "total", label: "Amount", value: formatINR(34999), field: "amount" },
          { t: "text", text: "1 year brand warranty from date of purchase.", muted: true },
        ],
      ],
    },
    {
      id: "doc-tax-ack",
      title: "Income tax return acknowledgement",
      docType: "tax",
      vendor: "Tax e-filing (demo)",
      accent: "#15803d",
      filename: "itr-acknowledgement.pdf",
      source: "upload",
      status: "ready",
      createdDaysAgo: 94,
      tags: ["tax", "return", "refund"],
      fields: { vendor: "Tax e-filing (demo)", amount: 4320, docDate: rel(-95) },
      pages: [
        [
          { t: "title", text: "Return filed: acknowledgement" },
          { t: "row", label: "Assessment year", value: "Current year (demo)" },
          { t: "row", label: "PAN", value: "●●●●●●●●4F", field: "referenceMasked" },
          { t: "row", label: "Filed on", value: formatDate(rel(-95)), field: "docDate" },
          { t: "total", label: "Refund due", value: formatINR(4320), field: "amount" },
        ],
      ],
    },
    {
      id: "doc-pan",
      title: "PAN card",
      docType: "id",
      vendor: "Identity document",
      accent: "#4338ca",
      filename: "pan-card.jpg",
      source: "camera",
      status: "ready",
      createdDaysAgo: 200,
      tags: ["id", "pan"],
      fields: { referenceMasked: "●●●●●●●●4F" },
      pages: [
        [
          { t: "title", text: "Permanent account number card" },
          { t: "row", label: "Number", value: "●●●●●●●●4F", field: "referenceMasked" },
          { t: "text", text: "The full number is hidden in Life Vault by design.", muted: true },
        ],
      ],
    },
    {
      id: "doc-pharmacy",
      title: "CarePlus pharmacy bill",
      docType: "medical",
      vendor: "CarePlus Pharmacy",
      accent: "#be123c",
      filename: "IMG_20261018_pharmacy.jpg",
      source: "camera",
      status: "needs_review",
      createdDaysAgo: 2,
      tags: ["medicine"],
      fields: { vendor: "CarePlus Pharmacy", amount: 860, docDate: rel(-2) },
      confidence: { amount: 0.55, docDate: 0.62, vendor: 0.97 },
      pages: [
        [
          { t: "title", text: "Pharmacy bill" },
          { t: "row", label: "Paracetamol 650 (15)", value: formatINR(45) },
          { t: "row", label: "Vitamin D3 (8)", value: formatINR(215) },
          { t: "row", label: "Cough syrup 100 ml", value: formatINR(600) },
          { t: "row", label: "Date", value: formatDate(rel(-2)), field: "docDate" },
          { t: "total", label: "Total", value: formatINR(860), field: "amount" },
        ],
      ],
    },
    {
      id: "doc-washer-manual",
      title: "Spinwell washing machine manual",
      docType: "manual",
      vendor: "Spinwell Home",
      accent: "#7c3aed",
      filename: "spinwell-manual.pdf",
      source: "upload",
      status: "ready",
      createdDaysAgo: 350,
      tags: ["washing machine", "appliance", "manual"],
      fields: { vendor: "Spinwell Home" },
      pages: [
        [
          { t: "title", text: "User manual: SW-FL7" },
          { t: "text", text: "Read all instructions before first use." },
          { t: "gap" },
          { t: "title", text: "Care and cleaning" },
          {
            t: "para",
            cite: "descale",
            lines: [
              "Once a month, run an empty Tub Clean cycle at 90°C with a",
              "spoon of descaler in the detergent drawer. This removes",
              "limescale and prevents bad smells.",
            ],
          },
          {
            t: "para",
            cite: "filter",
            lines: [
              "Clean the drain filter (front, bottom right) every 3 months.",
              "Keep a towel ready, as some water will come out.",
            ],
          },
        ],
        [
          { t: "title", text: "Error codes" },
          { t: "row", label: "E1", value: "Door not closed" },
          { t: "row", label: "E3", value: "Drain blocked: clean filter" },
          { t: "row", label: "E5", value: "No water: check tap" },
        ],
      ],
      passages: {
        descale: {
          page: 1,
          text: "Once a month, run an empty Tub Clean cycle at 90°C with a spoon of descaler in the detergent drawer.",
        },
        filter: {
          page: 1,
          text: "Clean the drain filter (front, bottom right) every 3 months.",
        },
      },
    },
    {
      id: "doc-processing",
      title: "New scan",
      docType: "other",
      vendor: "AquaCity Water",
      accent: "#0891b2",
      filename: "IMG_4821.jpg",
      source: "camera",
      status: "processing",
      createdDaysAgo: 0,
      tags: ["water", "utility"],
      fields: { vendor: "AquaCity Water", amount: 640, docDate: rel(-1), dueDate: rel(14) },
      confidence: { vendor: 0.93, amount: 0.71, docDate: 0.88, dueDate: 0.64 },
      finished: { title: "AquaCity water bill", docType: "bill" },
      pages: [
        [
          { t: "title", text: "Water bill" },
          { t: "row", label: "Connection no.", value: "●●●● 3307" },
          { t: "row", label: "Bill date", value: formatDate(rel(-1)), field: "docDate" },
          { t: "row", label: "Consumption", value: "18 kL" },
          { t: "total", label: "Amount due", value: formatINR(640), field: "amount" },
          { t: "row", label: "Pay by", value: formatDate(rel(14)), field: "dueDate" },
        ],
      ],
    },
    {
      id: "doc-failed",
      title: "blurry-receipt.jpg",
      docType: "other",
      accent: "#57534e",
      filename: "blurry-receipt.jpg",
      source: "camera",
      status: "failed",
      createdDaysAgo: 1,
      tags: [],
      fields: {},
      error: "The photo is too blurry to read. Try again in better light.",
      pages: [],
    },
  ];
  return docs;
}

function daysFromToday(iso: string): number {
  return Math.round(
    (new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${todayISO()}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

// --- Layout + SVG drawing -------------------------------------------------------

type Placed = {
  x: number;
  y: number;
  size: number;
  text: string;
  bold?: boolean;
  muted?: boolean;
  anchor?: "start" | "end";
};

export type LaidOutPage = {
  texts: Placed[];
  rules: { y: number }[];
  bands: { y: number; h: number }[];
  fieldBoxes: Partial<Record<FieldKey, Box>>;
  citeBoxes: Record<string, Box>;
};

const LEFT = 48;
const RIGHT = PAGE_W - 48;
const textWidth = (text: string, size: number) => text.length * size * 0.54;

function toPct(page: number, x: number, y: number, w: number, h: number): Box {
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    page,
    x: r((x / PAGE_W) * 100),
    y: r((y / PAGE_H) * 100),
    w: r((w / PAGE_W) * 100),
    h: r((h / PAGE_H) * 100),
  };
}

/** Positions every block on a page and records where fields and passages ended up. */
export function layoutPage(blocks: Block[], pageNumber: number): LaidOutPage {
  const out: LaidOutPage = { texts: [], rules: [], bands: [], fieldBoxes: {}, citeBoxes: {} };
  let y = 150;

  for (const b of blocks) {
    switch (b.t) {
      case "title":
        y += 10;
        out.texts.push({ x: LEFT, y, size: 18, text: b.text, bold: true });
        y += 28;
        break;
      case "text":
        out.texts.push({ x: LEFT, y, size: 12, text: b.text, muted: b.muted });
        y += 22;
        break;
      case "gap":
        y += 14;
        break;
      case "row":
      case "total": {
        const size = b.t === "total" ? 15 : 13;
        if (b.t === "total") out.bands.push({ y: y - size - 8, h: size + 18 });
        out.texts.push({ x: LEFT + 6, y, size, text: b.label, bold: b.t === "total", muted: b.t === "row" });
        out.texts.push({ x: RIGHT - 6, y, size, text: b.value, bold: true, anchor: "end" });
        if (b.field) {
          const w = textWidth(b.value, size) + 12;
          out.fieldBoxes[b.field] = toPct(pageNumber, RIGHT - 6 - w + 6, y - size - 4, w, size + 12);
        }
        if (b.t === "row") out.rules.push({ y: y + 9 });
        y += b.t === "total" ? 36 : 28;
        break;
      }
      case "para": {
        const top = y - 14;
        for (const line of b.lines) {
          out.texts.push({ x: LEFT, y, size: 13, text: line });
          y += 20;
        }
        if (b.cite) {
          const w = Math.max(...b.lines.map((l) => textWidth(l, 13)));
          out.citeBoxes[b.cite] = toPct(pageNumber, LEFT - 6, top - 2, w + 12, y - top - 4);
        }
        y += 10;
        break;
      }
    }
  }
  return out;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Draws one page of a demo document as an SVG string. */
export function renderPageSvg(doc: DemoDoc, pageIndex: number): string {
  const blocks = doc.pages[pageIndex] ?? [];
  const page = layoutPage(blocks, pageIndex + 1);
  const vendor = doc.vendor ?? doc.title;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}" font-family="Helvetica, Arial, sans-serif">`,
    `<rect width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>`,
    `<rect width="${PAGE_W}" height="92" fill="${doc.accent}"/>`,
    `<circle cx="${LEFT + 22}" cy="46" r="22" fill="#ffffff" fill-opacity="0.18"/>`,
    `<text x="${LEFT + 22}" y="52" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(initials(vendor))}</text>`,
    `<text x="${LEFT + 58}" y="44" font-size="20" font-weight="700" fill="#ffffff">${esc(vendor)}</text>`,
    `<text x="${LEFT + 58}" y="66" font-size="11" fill="#ffffff" fill-opacity="0.8">Sample document · fictional company · for demo only</text>`,
  ];
  for (const band of page.bands) {
    parts.push(`<rect x="${LEFT - 4}" y="${band.y}" width="${RIGHT - LEFT + 8}" height="${band.h}" rx="6" fill="#f5f5f4"/>`);
  }
  for (const rule of page.rules) {
    parts.push(`<line x1="${LEFT}" x2="${RIGHT}" y1="${rule.y}" y2="${rule.y}" stroke="#e7e5e4" stroke-width="1"/>`);
  }
  for (const t of page.texts) {
    const fill = t.muted ? "#78716c" : "#1c1917";
    parts.push(
      `<text x="${t.x}" y="${t.y}" font-size="${t.size}"${t.bold ? ' font-weight="700"' : ""} fill="${fill}"${t.anchor === "end" ? ' text-anchor="end"' : ""}>${esc(t.text)}</text>`,
    );
  }
  parts.push(
    `<text x="${PAGE_W / 2}" y="${PAGE_H - 28}" font-size="10" fill="#a8a29e" text-anchor="middle">Page ${pageIndex + 1} of ${doc.pages.length}</text>`,
    `</svg>`,
  );
  return parts.join("");
}
