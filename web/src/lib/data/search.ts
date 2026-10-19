import type { DocType, DocumentSummary } from "./types";

export type DocumentFilter = { q?: string; type?: DocType | "all" };

/** Case-insensitive match on title, vendor, tags and filename; every word must match. */
export function filterDocuments<T extends DocumentSummary>(docs: T[], filter: DocumentFilter): T[] {
  const words = (filter.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return docs.filter((d) => {
    if (filter.type && filter.type !== "all" && d.docType !== filter.type) return false;
    if (words.length === 0) return true;
    const haystack = [d.title, d.vendor ?? "", d.originalFilename, ...d.tags].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export function countByType(docs: DocumentSummary[]): Partial<Record<DocType, number>> {
  const counts: Partial<Record<DocType, number>> = {};
  for (const d of docs) counts[d.docType] = (counts[d.docType] ?? 0) + 1;
  return counts;
}
