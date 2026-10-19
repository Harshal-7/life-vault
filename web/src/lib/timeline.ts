import type { Deadline } from "./data/types";
import { daysUntil, todayISO, type Urgency, urgencyOf } from "./format";

export type DeadlineGroup = { urgency: Urgency; items: (Deadline & { days: number })[] };

const ORDER: Urgency[] = ["overdue", "week", "month", "later"];

/** Deadlines grouped by urgency, soonest first; empty groups left out. */
export function groupDeadlines(deadlines: Deadline[], today: string = todayISO()): DeadlineGroup[] {
  const groups = new Map<Urgency, DeadlineGroup["items"]>();
  for (const d of deadlines) {
    const days = daysUntil(d.dueDate, today);
    const u = urgencyOf(days);
    groups.set(u, [...(groups.get(u) ?? []), { ...d, days }]);
  }
  return ORDER.filter((u) => groups.has(u)).map((urgency) => ({
    urgency,
    items: groups.get(urgency)!.sort((a, b) => a.days - b.days),
  }));
}

/** Which document field holds this deadline's date (for the "show on page" link). */
export function deadlineField(kind: Deadline["kind"]): "dueDate" | "expiryDate" {
  return kind === "bill_due" ? "dueDate" : "expiryDate";
}
