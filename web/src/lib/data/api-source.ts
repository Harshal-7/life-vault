import "server-only";

import { apiFetch } from "@/lib/api";

import type { DocumentDetail, DocumentSummary, UploadRequest, UploadResult } from "./types";
import type { DocumentFilter } from "./search";

/** The real backend (FastAPI). Used whenever demo mode is off. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const res = await apiFetch(path, { ...init, headers });
  if (!res.ok) {
    const detail = await res.json().then((b: { detail?: unknown }) => b.detail).catch(() => null);
    throw new ApiError(res.status, typeof detail === "string" ? detail : `API error ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

type ApiDocument = DocumentSummary;
type ApiDetail = DocumentDetail;

export async function listDocuments(filter: DocumentFilter): Promise<DocumentSummary[]> {
  const sp = new URLSearchParams();
  if (filter.q) sp.set("q", filter.q);
  if (filter.type && filter.type !== "all") sp.set("type", filter.type);
  return json<ApiDocument[]>(`/documents${sp.size ? `?${sp}` : ""}`);
}

export async function getDocument(id: string): Promise<DocumentDetail | null> {
  try {
    return await json<ApiDetail>(`/documents/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) return null;
    throw err;
  }
}

export async function createUpload(req: UploadRequest): Promise<UploadResult> {
  const res = await apiFetch("/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (res.status === 409) {
    const body = (await res.json()) as { existing: DocumentSummary };
    return { ok: false, reason: "duplicate", existing: body.existing };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new ApiError(res.status, typeof body.detail === "string" ? body.detail : "Upload couldn't start.");
  }
  const body = (await res.json()) as { document: DocumentSummary; uploadUrl: string };
  return { ok: true, document: body.document, uploadUrl: body.uploadUrl };
}

export async function completeUpload(id: string): Promise<DocumentSummary> {
  return json<DocumentSummary>(`/documents/${encodeURIComponent(id)}/complete`, { method: "POST" });
}

export async function retryDocument(id: string): Promise<void> {
  await json(`/documents/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

export async function updateDocument(id: string, patch: { title?: string; docType?: string }): Promise<void> {
  await json(`/documents/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteDocument(id: string): Promise<void> {
  await json(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
}
