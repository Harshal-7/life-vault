/**
 * Demo-mode answers. A small set of keyword rules stands in for the real pipeline
 * (router → field lookup / hybrid search → LLM answer). Each rule produces the same
 * things the real backend will stream: a route, an optional key fact, citations and text.
 */

import { daysUntil, formatDate, formatINR, relativeDays } from "@/lib/format";

import type { AskEvent, Citation, DocumentDetail, FieldKey } from "../types";
import type { DemoDoc } from "./demo-docs";
import { layoutPage } from "./demo-docs";

export type AskEntry = { demo: DemoDoc; detail: DocumentDetail };

type Route = Extract<AskEvent, { type: "route" }>["route"];
export type AskPlan =
  | {
      kind: "answer";
      route: Route;
      fact?: { label: string; value: string; detail?: string };
      citations: Citation[];
      answer: string;
    }
  | { kind: "not_found"; route: Route; suggestion: string };

const NOT_FOUND =
  "I couldn't find this in your vault. If it's in a document you haven't added yet, upload it and ask again.";

export function planAnswer(question: string, entries: AskEntry[]): AskPlan {
  const q = question.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  const byId = new Map(entries.map((e) => [e.detail.id, e]));
  const get = (id: string) => byId.get(id);

  const fieldCite = (id: string, field: FieldKey, snippet: string): Citation | null => {
    const e = get(id);
    if (!e) return null;
    const box = e.detail.fieldBoxes[field];
    return {
      documentId: id,
      title: e.detail.title,
      docType: e.detail.docType,
      page: box?.page ?? 1,
      box,
      snippet,
      thumbnailUrl: e.detail.thumbnailUrl,
    };
  };
  const passageCite = (id: string, name: string): Citation | null => {
    const e = get(id);
    const passage = e?.demo.passages?.[name];
    if (!e || !passage) return null;
    const box = layoutPage(e.demo.pages[passage.page - 1] ?? [], passage.page).citeBoxes[name];
    return {
      documentId: id,
      title: e.detail.title,
      docType: e.detail.docType,
      page: passage.page,
      box,
      snippet: passage.text,
      thumbnailUrl: e.detail.pages[passage.page - 1]?.url ?? e.detail.thumbnailUrl,
    };
  };
  const answer = (
    route: Route,
    citations: (Citation | null)[],
    text: string,
    fact?: { label: string; value: string; detail?: string },
  ): AskPlan => {
    const found = citations.filter((c): c is Citation => c !== null);
    if (found.length === 0) return { kind: "not_found", route, suggestion: NOT_FOUND };
    return { kind: "answer", route, fact, citations: found, answer: text };
  };
  const when = (iso: string) => {
    const days = daysUntil(iso);
    return `${formatDate(iso)} (${relativeDays(days)})`;
  };
  const expiry = (id: string) => get(id)?.detail.fields.expiryDate;

  // --- Warranties ---------------------------------------------------------------
  if (has("warrant", "guarantee")) {
    const target = has("fridge", "refrigerator")
      ? "doc-fridge-warranty"
      : has("washing", "washer")
        ? "doc-washer-warranty"
        : has("laptop", "computer")
          ? "doc-laptop-warranty"
          : null;
    if (target === "doc-fridge-warranty" && has("cover", "include", "claim")) {
      const name = has("claim") ? "claim" : "coverage";
      const c = passageCite(target, name);
      return answer("content_search", [c], c ? c.snippet : "");
    }
    if (target && expiry(target)) {
      const date = expiry(target)!;
      const days = daysUntil(date);
      const past = days < 0;
      return answer(
        "field_lookup",
        [fieldCite(target, "expiryDate", `Warranty valid until ${formatDate(date)}`)],
        past
          ? `This warranty ended on ${formatDate(date)}.`
          : `Your ${get(target)!.detail.title.replace(/ warranty$/i, "")} is covered until ${when(date)}.` +
              (days <= 30 ? " That's soon: if you want an extension, now is the time to ask." : ""),
        {
          label: past ? "Warranty ended" : "Warranty ends",
          value: formatDate(date),
          detail: relativeDays(days),
        },
      );
    }
    if (has("phone", "mobile", "nimbus")) {
      const r = get("doc-phone-receipt");
      if (r?.detail.fields.docDate) {
        return answer(
          "both",
          [fieldCite("doc-phone-receipt", "docDate", "1 year brand warranty from date of purchase")],
          `The receipt says the phone has a 1-year brand warranty from the purchase date, ${formatDate(r.detail.fields.docDate)}.`,
        );
      }
    }
  }

  // --- Electricity ----------------------------------------------------------------
  if (has("electric", "power bill", "light bill", "brightgrid")) {
    const bills = ["doc-elec-1", "doc-elec-2", "doc-elec-3"].map(get).filter((e): e is AskEntry => !!e);
    if (bills.length && has("total", "spend", "spent", "altogether", "last 3", "three", "sum")) {
      const sum = bills.reduce((n, b) => n + (b.detail.fields.amount ?? 0), 0);
      const parts = bills.map((b) => formatINR(b.detail.fields.amount ?? 0)).join(" + ");
      return answer(
        "field_lookup",
        bills.map((b) => fieldCite(b.detail.id, "amount", b.detail.title)),
        `Across your last ${bills.length} electricity bills you paid ${formatINR(sum)} (${parts}).`,
        { label: `Electricity, last ${bills.length} bills`, value: formatINR(sum), detail: parts },
      );
    }
    const latest = bills.at(-1);
    if (latest?.detail.fields.amount) {
      const due = latest.detail.fields.dueDate;
      return answer(
        "field_lookup",
        [fieldCite(latest.detail.id, "amount", latest.detail.title)],
        `Your latest electricity bill is ${formatINR(latest.detail.fields.amount)}` +
          (due ? `, due on ${when(due)}.` : "."),
        {
          label: "Latest electricity bill",
          value: formatINR(latest.detail.fields.amount),
          detail: due ? `Due ${formatDate(due)}` : undefined,
        },
      );
    }
  }

  // --- Broadband ------------------------------------------------------------------
  if (has("broadband", "internet", "wifi", "wi-fi", "skyfibre")) {
    const b = get("doc-broadband");
    if (b?.detail.fields.amount) {
      const due = b.detail.fields.dueDate;
      return answer(
        "field_lookup",
        [fieldCite("doc-broadband", "amount", b.detail.title)],
        `Your broadband bill is ${formatINR(b.detail.fields.amount)}` + (due ? `, due on ${when(due)}.` : "."),
        { label: "Broadband bill", value: formatINR(b.detail.fields.amount), detail: due ? `Due ${formatDate(due)}` : undefined },
      );
    }
  }

  // --- Health insurance -------------------------------------------------------------
  if (has("dental", "teeth", "tooth")) {
    const c = passageCite("doc-health-policy", "dental");
    return answer(
      "content_search",
      [c],
      "Only partly. Your Suraksha Health policy covers dental treatment only when it's needed because of an accident and you're hospitalised for at least 24 hours. Routine check-ups, cleaning, braces and cosmetic work aren't covered.",
      { label: "Dental cover", value: "Accidents only", detail: "Needs 24+ hours in hospital" },
    );
  }
  if (has("maternity", "pregnan", "delivery")) {
    const c = passageCite("doc-health-policy", "maternity");
    return answer("content_search", [c], c?.snippet ?? "", {
      label: "Maternity cover",
      value: formatINR(50000),
      detail: "After a 3-year waiting period",
    });
  }
  if (has("room rent", "icu")) {
    const c = passageCite("doc-health-policy", "room");
    return answer("content_search", [c], c?.snippet ?? "");
  }
  if (has("health", "medical insurance", "mediclaim", "suraksha")) {
    const p = get("doc-health-policy");
    if (p && has("premium", "cost", "pay", "how much")) {
      return answer(
        "field_lookup",
        [fieldCite("doc-health-policy", "amount", "Annual premium")],
        `You pay ${formatINR(p.detail.fields.amount ?? 0)} a year for the Suraksha Health family policy.`,
        { label: "Annual premium", value: formatINR(p.detail.fields.amount ?? 0) },
      );
    }
    if (p?.detail.fields.expiryDate) {
      const date = p.detail.fields.expiryDate;
      return answer(
        "field_lookup",
        [fieldCite("doc-health-policy", "expiryDate", "Renewal due")],
        `Your health policy renews on ${when(date)}. The current premium is ${formatINR(p.detail.fields.amount ?? 0)} a year.`,
        { label: "Health policy renewal", value: formatDate(date), detail: relativeDays(daysUntil(date)) },
      );
    }
  }

  // --- Car insurance ----------------------------------------------------------------
  if (has("car", "motor", "vehicle", "gaadi")) {
    const date = expiry("doc-car-insurance");
    if (date) {
      const days = daysUntil(date);
      return answer(
        "field_lookup",
        [fieldCite("doc-car-insurance", "expiryDate", "Valid until")],
        days < 0
          ? `Your car insurance expired on ${formatDate(date)}, ${relativeDays(days)}. Driving without valid insurance isn't allowed, so renew it as soon as you can.`
          : `Your car insurance is valid until ${when(date)}.`,
        { label: days < 0 ? "Car insurance expired" : "Car insurance valid until", value: formatDate(date), detail: relativeDays(days) },
      );
    }
  }

  // --- Rent -------------------------------------------------------------------------
  if (has("rent", "lease", "agreement", "landlord", "deposit", "notice")) {
    if (has("notice", "deposit", "leave", "move out", "refund")) {
      const c = passageCite("doc-rent-agreement", "notice");
      return answer("content_search", [c], c?.snippet ?? "", {
        label: "Notice period",
        value: "1 month",
        detail: `Deposit ${formatINR(84000)}, back within 15 days`,
      });
    }
    const r = get("doc-rent-agreement");
    if (r && has("how much", "monthly", "amount") && r.detail.fields.amount) {
      return answer(
        "field_lookup",
        [fieldCite("doc-rent-agreement", "amount", "Monthly rent")],
        `Your rent is ${formatINR(r.detail.fields.amount)} a month.`,
        { label: "Monthly rent", value: formatINR(r.detail.fields.amount) },
      );
    }
    const date = expiry("doc-rent-agreement");
    if (date) {
      return answer(
        "field_lookup",
        [fieldCite("doc-rent-agreement", "expiryDate", "End date")],
        `Your rent agreement for Flat 302 ends on ${when(date)}. Either side needs to give one month's written notice.`,
        { label: "Rent agreement ends", value: formatDate(date), detail: relativeDays(daysUntil(date)) },
      );
    }
  }

  // --- Washing machine care ---------------------------------------------------------
  if (has("descale", "limescale", "clean my washing", "clean the washing", "smell")) {
    const c = passageCite("doc-washer-manual", "descale");
    return answer("content_search", [c], c ? `${c.snippet} The manual says this also prevents bad smells.` : "");
  }
  if (has("filter", "e3", "drain")) {
    const c = passageCite("doc-washer-manual", "filter");
    return answer("content_search", [c], c?.snippet ?? "");
  }

  // --- Tax, ID, purchases ---------------------------------------------------------------
  if (has("refund", "tax", "itr")) {
    const t = get("doc-tax-ack");
    if (t?.detail.fields.amount) {
      return answer(
        "field_lookup",
        [fieldCite("doc-tax-ack", "amount", "Refund due")],
        `Your return acknowledgement shows a refund of ${formatINR(t.detail.fields.amount)}.`,
        { label: "Tax refund due", value: formatINR(t.detail.fields.amount) },
      );
    }
  }
  if (has("pan")) {
    return answer(
      "field_lookup",
      [fieldCite("doc-pan", "referenceMasked", "PAN")],
      "Your PAN card is in the vault. For safety, Life Vault only shows the last two characters: ●●●●●●●●4F. Open the document to see the full card.",
      { label: "PAN card", value: "●●●●●●●●4F" },
    );
  }
  if (has("phone", "mobile", "nimbus")) {
    const r = get("doc-phone-receipt");
    if (r?.detail.fields.amount) {
      return answer(
        "field_lookup",
        [fieldCite("doc-phone-receipt", "amount", "Amount")],
        `You paid ${formatINR(r.detail.fields.amount)} for the Nimbus N7 on ${formatDate(r.detail.fields.docDate!)}.`,
        { label: "Nimbus N7 price", value: formatINR(r.detail.fields.amount) },
      );
    }
  }
  if (has("fridge", "refrigerator", "coolwave")) {
    const r = get("doc-fridge-invoice");
    if (r?.detail.fields.amount) {
      return answer(
        "field_lookup",
        [fieldCite("doc-fridge-invoice", "amount", "Total paid")],
        `You bought the Coolwave fridge on ${formatDate(r.detail.fields.docDate!)} for ${formatINR(r.detail.fields.amount)}.`,
        { label: "Coolwave fridge", value: formatINR(r.detail.fields.amount), detail: `Bought ${formatDate(r.detail.fields.docDate!)}` },
      );
    }
  }

  return { kind: "not_found", route: "both", suggestion: NOT_FOUND };
}

export { STARTER_QUESTIONS } from "@/lib/starter-questions";
