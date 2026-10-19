import { describe, expect, it } from "vitest";

import type { DocumentSummary } from "./data/types";
import { keyLine } from "./doc-display";
import { addDays, todayISO } from "./format";

const base: DocumentSummary = {
  id: "d",
  title: "t",
  docType: "other",
  status: "ready",
  source: "upload",
  originalFilename: "f.pdf",
  sizeBytes: 1,
  pageCount: 1,
  thumbnailUrl: null,
  tags: [],
  createdAt: new Date().toISOString(),
};
const inDays = (n: number) => addDays(todayISO(), n);

describe("keyLine", () => {
  it("warns when a warranty ends within a month", () => {
    expect(keyLine({ ...base, docType: "warranty", expiryDate: inDays(12) })).toEqual({
      text: "Ends in 12 days",
      tone: "warn",
    });
  });
  it("shows the full date when it's far away", () => {
    expect(keyLine({ ...base, docType: "warranty", expiryDate: "2099-03-12" })?.text).toBe("Valid until 12 Mar 2099");
    expect(keyLine({ ...base, docType: "insurance", expiryDate: inDays(20) })?.text).toBe("Renews in 20 days");
  });
  it("flags expired policies", () => {
    expect(keyLine({ ...base, docType: "insurance", expiryDate: inDays(-6) })?.tone).toBe("danger");
  });
  it("shows amount and due date for bills", () => {
    expect(keyLine({ ...base, docType: "bill", amount: 1980, expiryDate: inDays(5) })?.text).toBe("₹1,980 · due in 5 days");
  });
  it("shows nothing when there's nothing known", () => {
    expect(keyLine(base)).toBeNull();
  });
});
