/**
 * Shapes shared by the UI and the data layer. They mirror what the FastAPI backend
 * will return, so swapping the mock store for real API calls doesn't touch components.
 */

export const DOC_TYPES = [
  "bill",
  "receipt",
  "warranty",
  "insurance",
  "rent",
  "medical",
  "tax",
  "id",
  "manual",
  "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type DocStatus = "uploaded" | "processing" | "needs_review" | "ready" | "failed";
export type DocSource = "upload" | "camera" | "email";

/** A rectangle on a document page, in % of the page size (0–100). */
export type Box = { page: number; x: number; y: number; w: number; h: number };

export type DocFields = {
  vendor?: string;
  amount?: number; // rupees
  docDate?: string; // ISO date (YYYY-MM-DD)
  expiryDate?: string; // ISO date: warranty end, policy renewal, agreement end…
  dueDate?: string; // ISO date: bill payment due
  referenceMasked?: string; // policy / account / ID number, already masked: ●●●● 4821
};
export type FieldKey = keyof DocFields;

export type DocumentPage = { url: string; width: number; height: number };

export type DocumentSummary = {
  id: string;
  title: string;
  docType: DocType;
  status: DocStatus;
  source: DocSource;
  originalFilename: string;
  sizeBytes: number;
  pageCount: number;
  thumbnailUrl: string | null;
  tags: string[];
  vendor?: string;
  amount?: number;
  docDate?: string;
  expiryDate?: string;
  createdAt: string; // ISO datetime
  error?: string;
  mimeType?: string;
};

export type DocumentDetail = DocumentSummary & {
  fields: DocFields;
  /** Where each extracted field was found, for highlighting. */
  fieldBoxes: Partial<Record<FieldKey, Box>>;
  /** Extraction confidence 0–1 per field; low values get flagged in review. */
  confidence: Partial<Record<FieldKey, number>>;
  pages: DocumentPage[];
  /** Short-lived link to the original file (real backend only). */
  fileUrl?: string | null;
};

export type DeadlineKind =
  | "warranty_end"
  | "policy_renewal"
  | "agreement_end"
  | "bill_due"
  | "id_expiry";

export type Deadline = {
  id: string;
  documentId: string;
  documentTitle: string;
  docType: DocType;
  kind: DeadlineKind;
  dueDate: string; // ISO date
  remindersOn: boolean;
};

export type Citation = {
  documentId: string;
  title: string;
  docType: DocType;
  page: number;
  box?: Box;
  snippet: string;
  thumbnailUrl: string | null;
};

/** Events streamed by /api/ask (Server-Sent Events), in this order. */
export type AskEvent =
  | { type: "route"; route: "field_lookup" | "content_search" | "both" }
  | { type: "fact"; label: string; value: string; detail?: string }
  | { type: "sources"; citations: Citation[] }
  | { type: "delta"; text: string }
  | { type: "not_found"; suggestion: string }
  | { type: "done"; askId: string };

export type AskHistoryItem = {
  id: string;
  question: string;
  factValue?: string;
  askedAt: string;
};

export type Settings = {
  email: string;
  inboundAddress: string;
  allowedSenders: string[];
  reminderDays: number[]; // days before a deadline, e.g. [30, 7, 1]
};

export type UploadRequest = {
  filename: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  source: DocSource;
};

export type UploadResult =
  | { ok: true; document: DocumentSummary; uploadUrl?: string }
  | { ok: false; reason: "duplicate"; existing: DocumentSummary };
