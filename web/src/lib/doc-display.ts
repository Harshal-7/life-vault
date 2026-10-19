import { daysUntil, formatDate, formatINR, relativeDays } from "@/lib/format";

import type { DocumentSummary } from "./data/types";

export type KeyLine = { text: string; tone: "default" | "warn" | "danger" };

/**
 * The one fact worth showing on a document card, by type:
 * warranties/policies/agreements → validity; bills → amount + due; receipts → amount + date.
 */
export function keyLine(doc: DocumentSummary): KeyLine | null {
  const { docType, expiryDate, amount, docDate } = doc;

  if (expiryDate && ["warranty", "insurance", "rent", "id"].includes(docType)) {
    const days = daysUntil(expiryDate);
    if (days < 0) return { text: `Expired ${relativeDays(days)}`, tone: "danger" };
    const soon = days <= 31;
    const verb =
      docType === "insurance" ? "Renews" : docType === "rent" || soon ? (docType === "id" ? "Expires" : "Ends") : "Valid until";
    return {
      text: soon ? `${verb} ${relativeDays(days)}` : `${verb} ${formatDate(expiryDate)}`,
      tone: soon ? "warn" : "default",
    };
  }
  if (docType === "bill" && amount !== undefined) {
    if (expiryDate) {
      const days = daysUntil(expiryDate);
      if (days >= 0) return { text: `${formatINR(amount)} · due ${relativeDays(days)}`, tone: days <= 7 ? "warn" : "default" };
    }
    return { text: formatINR(amount), tone: "default" };
  }
  if (amount !== undefined) {
    return { text: docDate ? `${formatINR(amount)} · ${formatDate(docDate)}` : formatINR(amount), tone: "default" };
  }
  if (docDate) return { text: formatDate(docDate), tone: "default" };
  return null;
}
