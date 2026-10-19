import { beforeEach, describe, expect, it } from "vitest";

import { filterDocuments } from "../search";
import { planAnswer, STARTER_QUESTIONS } from "./ask";
import { buildDemoDocs, layoutPage, renderPageSvg } from "./demo-docs";
import * as store from "./store";

beforeEach(() => {
  globalThis.__lifeVaultMock = undefined;
});

const entries = () =>
  store.allDocuments().map((detail) => ({ demo: store.findEntry(detail.id)!.demo, detail }));

describe("demo documents", () => {
  it("uses fictional vendors and draws every page", () => {
    for (const doc of buildDemoDocs()) {
      doc.pages.forEach((_, i) => {
        const svg = renderPageSvg(doc, i);
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toContain("fictional company");
      });
    }
  });

  it("records a highlight box inside the page for every field it shows", () => {
    for (const doc of buildDemoDocs()) {
      doc.pages.forEach((blocks, i) => {
        for (const box of Object.values(layoutPage(blocks, i + 1).fieldBoxes)) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.w).toBeLessThanOrEqual(100);
          expect(box.y + box.h).toBeLessThanOrEqual(100);
        }
      });
    }
  });
});

describe("search", () => {
  it("matches every word across title, vendor and tags", () => {
    const docs = store.allDocuments();
    expect(filterDocuments(docs, { q: "fridge" }).map((d) => d.id).sort()).toEqual([
      "doc-fridge-invoice",
      "doc-fridge-warranty",
    ]);
    expect(filterDocuments(docs, { q: "coolwave warranty" }).map((d) => d.id)).toEqual(["doc-fridge-warranty"]);
    expect(filterDocuments(docs, { type: "bill" }).every((d) => d.docType === "bill")).toBe(true);
  });
});

describe("deadlines", () => {
  it("lists warranties, renewals and unpaid bills, but not old bills", () => {
    const kinds = store.deadlines().map((d) => `${d.documentId}:${d.kind}`);
    expect(kinds).toContain("doc-fridge-warranty:warranty_end");
    expect(kinds).toContain("doc-health-policy:policy_renewal");
    expect(kinds).toContain("doc-elec-3:bill_due");
    expect(kinds).not.toContain("doc-elec-1:bill_due");
  });
  it("can turn reminders off", () => {
    const id = store.deadlines()[0]!.id;
    store.setReminder(id, false);
    expect(store.deadlines().find((d) => d.id === id)?.remindersOn).toBe(false);
  });
});

describe("uploads", () => {
  it("flags an identical file as a duplicate", () => {
    const req = { filename: "bill.pdf", sizeBytes: 1000, mimeType: "application/pdf", sha256: "abc", source: "upload" as const };
    expect(store.addUpload(req).ok).toBe(true);
    expect(store.addUpload(req)).toMatchObject({ ok: false, reason: "duplicate" });
  });
  it("guesses the type and a readable title from the filename", () => {
    expect(store.guessType("Electricity_Bill_Oct.pdf")).toBe("bill");
    expect(store.guessType("fridge-warranty.jpg")).toBe("warranty");
    expect(store.prettyTitle("IMG_4821.jpg")).toBe("New scan");
    expect(store.prettyTitle("rent_agreement-2026.pdf")).toBe("Rent agreement 2026");
  });
  it("confirming a review marks the document ready", () => {
    store.updateFields("doc-pharmacy", { amount: 860 }, true);
    expect(store.findEntry("doc-pharmacy")!.detail.status).toBe("ready");
  });
});

describe("demo answers", () => {
  it("answers every starter question with a cited source", () => {
    for (const q of STARTER_QUESTIONS) {
      const plan = planAnswer(q, entries());
      expect(plan.kind, q).toBe("answer");
      if (plan.kind === "answer") expect(plan.citations.length, q).toBeGreaterThan(0);
    }
  });
  it("gives an exact fact for field questions", () => {
    const plan = planAnswer("when does my fridge warranty expire", entries());
    expect(plan).toMatchObject({ kind: "answer", route: "field_lookup", fact: { label: "Warranty ends" } });
  });
  it("sums bills when asked for a total", () => {
    const plan = planAnswer("how much did I spend on electricity in total?", entries());
    expect(plan.kind === "answer" && plan.fact?.value).toBe("₹7,030");
  });
  it("says not found instead of guessing", () => {
    expect(planAnswer("what is my passport number?", entries()).kind).toBe("not_found");
  });
});
