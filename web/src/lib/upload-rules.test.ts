import { describe, expect, it } from "vitest";

import { checkFile, MAX_UPLOAD_BYTES } from "./upload-rules";

describe("checkFile", () => {
  it("accepts PDFs and photos, including HEIC with no MIME type", () => {
    expect(checkFile({ name: "bill.pdf", type: "application/pdf", size: 1000 }).ok).toBe(true);
    expect(checkFile({ name: "IMG_1.HEIC", type: "", size: 1000 }).ok).toBe(true);
  });
  it("rejects other types, empty files and files over 20 MB", () => {
    expect(checkFile({ name: "notes.docx", type: "application/msword", size: 1000 }).ok).toBe(false);
    expect(checkFile({ name: "a.pdf", type: "application/pdf", size: 0 }).ok).toBe(false);
    expect(checkFile({ name: "a.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES + 1 }).ok).toBe(false);
  });
});
