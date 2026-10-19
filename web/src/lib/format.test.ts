import { describe, expect, it } from "vitest";

import {
  addDays,
  daysUntil,
  formatBytes,
  formatDate,
  formatINR,
  relativeDays,
  todayISO,
  urgencyOf,
} from "./format";

describe("formatINR", () => {
  it("uses Indian lakh grouping", () => {
    expect(formatINR(124500)).toBe("₹1,24,500");
    expect(formatINR(500000)).toBe("₹5,00,000");
  });
  it("shows paise only when there are some", () => {
    expect(formatINR(1179)).toBe("₹1,179");
    expect(formatINR(1179.5)).toBe("₹1,179.50");
  });
});

describe("dates", () => {
  it("formats as day month year", () => {
    expect(formatDate("2027-03-12")).toBe("12 Mar 2027");
  });
  it("counts days between dates", () => {
    expect(daysUntil("2026-11-01", "2026-10-20")).toBe(12);
    expect(daysUntil("2026-10-14", "2026-10-20")).toBe(-6);
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
  });
  it("uses the Indian date for today", () => {
    // 20:00 UTC on 19 Oct is already 20 Oct in India.
    expect(todayISO(new Date("2026-10-19T20:00:00Z"))).toBe("2026-10-20");
  });
  it("describes relative days in words", () => {
    expect(relativeDays(0)).toBe("today");
    expect(relativeDays(1)).toBe("tomorrow");
    expect(relativeDays(12)).toBe("in 12 days");
    expect(relativeDays(-6)).toBe("6 days ago");
    expect(relativeDays(145)).toBe("in 5 months");
    expect(relativeDays(410)).toBe("in 1.1 years");
  });
  it("groups by urgency", () => {
    expect(urgencyOf(-1)).toBe("overdue");
    expect(urgencyOf(0)).toBe("week");
    expect(urgencyOf(7)).toBe("week");
    expect(urgencyOf(20)).toBe("month");
    expect(urgencyOf(90)).toBe("later");
  });
});

describe("formatBytes", () => {
  it("picks a readable unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
  });
});
