import "server-only";

import { daysUntil, todayISO } from "@/lib/format";

import type {
  AskHistoryItem,
  Box,
  Deadline,
  DeadlineKind,
  DocFields,
  DocType,
  DocumentDetail,
  DocumentSummary,
  FieldKey,
  Settings,
  UploadRequest,
  UploadResult,
} from "../types";
import { buildDemoDocs, type DemoDoc, layoutPage, PAGE_H, PAGE_W } from "./demo-docs";

/**
 * In-memory stand-in for the backend. Lives on globalThis so Next's hot reload keeps
 * your changes while you work; restarting the dev server resets it. Rebuilt each day
 * so relative dates ("in 12 days") stay right.
 */

type Entry = {
  demo: DemoDoc;
  detail: DocumentDetail;
  sha256?: string;
  /** For uploads: when processing "finishes" (ms epoch). */
  readyAt?: number;
  willFail?: boolean;
};

type Store = {
  seededOn: string;
  entries: Map<string, Entry>;
  remindersOff: Set<string>;
  asks: AskHistoryItem[];
  feedback: Map<string, "up" | "down">;
  settings: Settings;
};

const PROCESSING_MS = 5000;

declare global {
  var __lifeVaultMock: Store | undefined;
}

export function store(): Store {
  const today = todayISO();
  if (!globalThis.__lifeVaultMock || globalThis.__lifeVaultMock.seededOn !== today) {
    globalThis.__lifeVaultMock = seed(today);
  }
  advanceUploads(globalThis.__lifeVaultMock);
  return globalThis.__lifeVaultMock;
}

function seed(today: string): Store {
  const entries = new Map<string, Entry>();
  for (const demo of buildDemoDocs()) {
    entries.set(demo.id, { demo, detail: toDetail(demo) });
  }
  return {
    seededOn: today,
    entries,
    remindersOff: new Set(),
    asks: [],
    feedback: new Map(),
    settings: {
      email: "demo@lifevault.local",
      inboundAddress: "demo.k7q2@in.lifevault.app",
      allowedSenders: ["demo@lifevault.local"],
      reminderDays: [30, 7, 1],
    },
  };
}

function toDetail(demo: DemoDoc, createdAt?: string): DocumentDetail {
  const fieldBoxes: Partial<Record<FieldKey, Box>> = {};
  demo.pages.forEach((blocks, i) => Object.assign(fieldBoxes, layoutPage(blocks, i + 1).fieldBoxes));
  const pages = demo.pages.map((_, i) => ({
    url: `/demo-pages/${demo.id}/${i + 1}`,
    width: PAGE_W,
    height: PAGE_H,
  }));
  const created =
    createdAt ?? new Date(Date.now() - demo.createdDaysAgo * 86_400_000 - 3_600_000).toISOString();
  return {
    id: demo.id,
    title: demo.title,
    docType: demo.docType,
    status: demo.status,
    source: demo.source,
    originalFilename: demo.filename,
    sizeBytes: 80_000 + demo.pages.length * 145_000 + demo.title.length * 997,
    pageCount: demo.pages.length,
    thumbnailUrl: pages[0]?.url ?? null,
    tags: demo.tags,
    vendor: demo.fields.vendor,
    amount: demo.fields.amount,
    docDate: demo.fields.docDate,
    expiryDate: demo.fields.expiryDate ?? demo.fields.dueDate,
    createdAt: created,
    error: demo.error,
    fields: { ...demo.fields },
    fieldBoxes,
    confidence: demo.confidence ?? {},
    pages,
  };
}

export function toSummary(d: DocumentDetail): DocumentSummary {
  // Strip the heavy detail-only fields.
  const { fields: _f, fieldBoxes: _b, confidence: _c, pages: _p, ...summary } = d;
  return summary;
}

// --- Reads ---------------------------------------------------------------------

export function allDocuments(): DocumentDetail[] {
  return [...store().entries.values()]
    .map((e) => e.detail)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function findEntry(id: string): Entry | undefined {
  return store().entries.get(id);
}

export function deadlines(): Deadline[] {
  const s = store();
  const out: Deadline[] = [];
  for (const { detail: d } of s.entries.values()) {
    if (d.status !== "ready" && d.status !== "needs_review") continue;
    const add = (kind: DeadlineKind, dueDate: string) => {
      const id = `${d.id}:${kind}`;
      out.push({
        id,
        documentId: d.id,
        documentTitle: d.title,
        docType: d.docType,
        kind,
        dueDate,
        remindersOn: !s.remindersOff.has(id),
      });
    };
    const { expiryDate, dueDate } = d.fields;
    if (expiryDate) {
      const kind: Partial<Record<DocType, DeadlineKind>> = {
        warranty: "warranty_end",
        insurance: "policy_renewal",
        rent: "agreement_end",
        id: "id_expiry",
      };
      if (kind[d.docType]) add(kind[d.docType]!, expiryDate);
    }
    // Only bills that are still due (or just missed) count; old paid bills don't.
    if (dueDate && daysUntil(dueDate) >= -3) add("bill_due", dueDate);
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// --- Writes --------------------------------------------------------------------

export function updateFields(id: string, fields: DocFields, confirm: boolean): DocumentDetail | null {
  const entry = findEntry(id);
  if (!entry) return null;
  const d = entry.detail;
  d.fields = { ...d.fields, ...fields };
  d.vendor = d.fields.vendor;
  d.amount = d.fields.amount;
  d.docDate = d.fields.docDate;
  d.expiryDate = d.fields.expiryDate ?? d.fields.dueDate;
  // Edited fields are now confirmed by a person.
  for (const key of Object.keys(fields) as FieldKey[]) d.confidence[key] = 1;
  if (confirm && d.status === "needs_review") d.status = "ready";
  return d;
}

export function updateDocument(
  id: string,
  patch: { title?: string; docType?: DocType; tags?: string[] },
): DocumentDetail | null {
  const entry = findEntry(id);
  if (!entry) return null;
  Object.assign(entry.detail, patch);
  return entry.detail;
}

export function deleteDocument(id: string): boolean {
  return store().entries.delete(id);
}

export function setReminder(deadlineId: string, on: boolean) {
  const s = store();
  if (on) s.remindersOff.delete(deadlineId);
  else s.remindersOff.add(deadlineId);
}

export function addUpload(req: UploadRequest): UploadResult {
  const s = store();
  for (const e of s.entries.values()) {
    if (e.sha256 && e.sha256 === req.sha256) return { ok: false, reason: "duplicate", existing: toSummary(e.detail) };
  }
  const id = `up-${crypto.randomUUID().slice(0, 8)}`;
  const docType = guessType(req.filename);
  const demo: DemoDoc = {
    id,
    title: prettyTitle(req.filename),
    docType,
    accent: "#57534e",
    filename: req.filename,
    source: req.source,
    status: "processing",
    createdDaysAgo: 0,
    tags: [],
    fields: {},
    confidence: { vendor: 0.5, docDate: 0.5 },
    pages: [
      [
        { t: "title", text: "Your uploaded file" },
        { t: "row", label: "File name", value: req.filename },
        { t: "row", label: "Received", value: new Date().toLocaleDateString("en-IN") },
        { t: "gap" },
        { t: "text", text: "Demo mode shows this placeholder instead of your file.", muted: true },
        { t: "text", text: "With the real backend, your actual pages appear here.", muted: true },
      ],
    ],
  };
  const detail = toDetail(demo, new Date().toISOString());
  detail.sizeBytes = req.sizeBytes;
  detail.status = "processing";
  s.entries.set(id, {
    demo,
    detail,
    sha256: req.sha256,
    readyAt: Date.now() + PROCESSING_MS,
    willFail: /blur|fail/i.test(req.filename),
  });
  return { ok: true, document: toSummary(detail) };
}

export function retryUpload(id: string): DocumentDetail | null {
  const entry = findEntry(id);
  if (!entry) return null;
  entry.detail.status = "processing";
  entry.detail.error = undefined;
  entry.readyAt = Date.now() + PROCESSING_MS;
  entry.willFail = false;
  return entry.detail;
}

/** Uploads "finish processing" a few seconds after they arrive. */
function advanceUploads(s: Store) {
  const now = Date.now();
  for (const e of s.entries.values()) {
    if (e.readyAt && e.detail.status === "processing" && now >= e.readyAt) {
      if (e.willFail) {
        e.detail.status = "failed";
        e.detail.error = "We couldn't read this file. Try a sharper photo or the original PDF.";
      } else {
        e.detail.status = "needs_review";
        e.detail.fields = { vendor: "Unknown vendor", docDate: todayISO() };
        e.detail.vendor = e.detail.fields.vendor;
        e.detail.docDate = e.detail.fields.docDate;
      }
      e.readyAt = undefined;
    }
  }
}

// --- Ask history + feedback ------------------------------------------------------

export function recordAsk(question: string, factValue?: string): AskHistoryItem {
  const item = { id: `ask-${crypto.randomUUID().slice(0, 8)}`, question, factValue, askedAt: new Date().toISOString() };
  const s = store();
  s.asks = [item, ...s.asks.filter((a) => a.question.toLowerCase() !== question.toLowerCase())].slice(0, 20);
  return item;
}

export function askHistory(): AskHistoryItem[] {
  return store().asks;
}

export function setFeedback(askId: string, value: "up" | "down") {
  store().feedback.set(askId, value);
}

export function settings(): Settings {
  return store().settings;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const s = store();
  s.settings = { ...s.settings, ...patch };
  return s.settings;
}

// --- Helpers ---------------------------------------------------------------------

export function guessType(filename: string): DocType {
  const f = filename.toLowerCase();
  const rules: [RegExp, DocType][] = [
    [/warrant/, "warranty"],
    [/insur|policy/, "insurance"],
    [/rent|lease|agreement/, "rent"],
    [/electric|bill|broadband|water|gas/, "bill"],
    [/receipt|invoice|memo/, "receipt"],
    [/pharma|rx|prescription|medic|lab|report/, "medical"],
    [/tax|itr|form16|form-16/, "tax"],
    [/manual|guide/, "manual"],
    [/pan|aadhaar|passport|licen[cs]e|voter/, "id"],
  ];
  return rules.find(([re]) => re.test(f))?.[1] ?? "other";
}

export function prettyTitle(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  if (/^img\s?\d+|^scan|^\d+$/i.test(base)) return "New scan";
  return base.charAt(0).toUpperCase() + base.slice(1);
}
