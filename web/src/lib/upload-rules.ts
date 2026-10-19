/** What the upload box accepts. Shared by the client checks and (later) the API. */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

export const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/heic": "HEIC",
  "image/heif": "HEIC",
};

/** For the file input's `accept` attribute. HEIC often arrives without a MIME type, so list extensions too. */
export const ACCEPT_ATTR = [...Object.keys(ACCEPTED_TYPES), ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].join(",");

export type FileCheck = { ok: true } | { ok: false; reason: string };

export function checkFile(file: { name: string; type: string; size: number }): FileCheck {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const typeOk = file.type in ACCEPTED_TYPES || ["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);
  if (!typeOk) return { ok: false, reason: "Only PDFs and photos (JPG, PNG, WebP, HEIC) can be added." };
  if (file.size === 0) return { ok: false, reason: "This file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: "This file is over 20 MB. Try a smaller scan or photo." };
  return { ok: true };
}
