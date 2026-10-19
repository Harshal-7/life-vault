import { describe, expect, it } from "vitest";

import type { Deadline } from "./data/types";
import { groupDeadlines } from "./timeline";

const d = (id: string, dueDate: string): Deadline => ({
  id,
  documentId: id,
  documentTitle: id,
  docType: "warranty",
  kind: "warranty_end",
  dueDate,
  remindersOn: true,
});

describe("groupDeadlines", () => {
  it("groups by urgency in order and sorts each group soonest first", () => {
    const groups = groupDeadlines(
      [d("later", "2027-06-01"), d("month", "2026-11-10"), d("overdue", "2026-10-14"), d("week2", "2026-10-25"), d("week1", "2026-10-21")],
      "2026-10-20",
    );
    expect(groups.map((g) => g.urgency)).toEqual(["overdue", "week", "month", "later"]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(["week1", "week2"]);
    expect(groups[0]!.items[0]!.days).toBe(-6);
  });
  it("leaves out empty groups", () => {
    expect(groupDeadlines([d("a", "2027-06-01")], "2026-10-20").map((g) => g.urgency)).toEqual(["later"]);
  });
});
