import "server-only";

import { connection } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";

import * as api from "./api-source";
import * as mock from "./mock/store";
import { type DocumentFilter, filterDocuments } from "./search";
import type { AskHistoryItem, Deadline, DocumentDetail, DocumentSummary, Settings } from "./types";

/**
 * Everything the UI reads goes through here.
 * - Demo mode (dev only): the in-memory mock store with fictional documents.
 * - Otherwise: the FastAPI backend, for everything it supports so far. Features whose
 *   backend milestone hasn't landed return empty data (see docs/ui-tracker.md).
 *
 * `await connection()` marks each read as per-request, so Next never bakes
 * someone's documents into a prerendered page.
 */

export async function listDocuments(filter: DocumentFilter = {}): Promise<DocumentSummary[]> {
  await connection();
  if (isDemoMode()) return filterDocuments(mock.allDocuments(), filter).map(mock.toSummary);
  return api.listDocuments(filter);
}

export async function getDocument(id: string): Promise<DocumentDetail | null> {
  await connection();
  if (isDemoMode()) {
    const entry = mock.findEntry(id);
    return entry ? structuredClone(entry.detail) : null;
  }
  return api.getDocument(id);
}

// TODO(api, M3): GET /deadlines (needs extracted dates from M1).
export async function listDeadlines(): Promise<Deadline[]> {
  await connection();
  return isDemoMode() ? mock.deadlines() : [];
}

// TODO(api, M2): GET /asks?limit=
export async function listAskHistory(limit = 8): Promise<AskHistoryItem[]> {
  await connection();
  return isDemoMode() ? mock.askHistory().slice(0, limit) : [];
}

// TODO(api, M4): GET /settings (forwarding address, senders, reminder days).
export async function getSettings(): Promise<Settings> {
  await connection();
  if (isDemoMode()) return { ...mock.settings() };
  const user = await getCurrentUser();
  return { email: user.email, inboundAddress: "", allowedSenders: [user.email], reminderDays: [30, 7, 1] };
}
