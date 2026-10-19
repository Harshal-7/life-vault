import "server-only";

import { connection } from "next/server";

import * as mock from "./mock/store";
import { type DocumentFilter, filterDocuments } from "./search";
import type { AskHistoryItem, Deadline, DocumentDetail, DocumentSummary, Settings } from "./types";

/**
 * Everything the UI reads goes through here. Today it's the in-memory mock store;
 * each function has a TODO naming the FastAPI endpoint that will replace it
 * (see docs/ui-tracker.md → "Backend hookup").
 *
 * `await connection()` marks each read as per-request, so Next never bakes
 * someone's documents into a prerendered page.
 */

// TODO(api): GET /documents?q=&type=
export async function listDocuments(filter: DocumentFilter = {}): Promise<DocumentSummary[]> {
  await connection();
  return filterDocuments(mock.allDocuments(), filter).map(mock.toSummary);
}

// TODO(api): GET /documents/{id}
export async function getDocument(id: string): Promise<DocumentDetail | null> {
  await connection();
  const entry = mock.findEntry(id);
  return entry ? structuredClone(entry.detail) : null;
}

// TODO(api): GET /deadlines
export async function listDeadlines(): Promise<Deadline[]> {
  await connection();
  return mock.deadlines();
}

// TODO(api): GET /asks?limit=
export async function listAskHistory(limit = 8): Promise<AskHistoryItem[]> {
  await connection();
  return mock.askHistory().slice(0, limit);
}

// TODO(api): GET /settings
export async function getSettings(): Promise<Settings> {
  await connection();
  return { ...mock.settings() };
}
