/**
 * Formatting for an Indian audience: ₹ with lakh grouping, "12 Mar 2027" dates,
 * and "today" measured in IST. Dates are ISO strings (YYYY-MM-DD) throughout.
 */

const IST = "Asia/Kolkata";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inrPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 124500 → "₹1,24,500"; 1179.5 → "₹1,179.50" */
export function formatINR(amount: number): string {
  return Number.isInteger(amount) ? inr.format(amount) : inrPaise.format(amount);
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const shortDateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function parseISODate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

/** "2027-03-12" → "12 Mar 2027" */
export function formatDate(iso: string): string {
  return dateFmt.format(parseISODate(iso));
}

/** "2027-03-12" → "12 Mar" */
export function formatShortDate(iso: string): string {
  return shortDateFmt.format(parseISODate(iso));
}

/** Today's date in India, as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` (default: today in IST) to `iso`. Negative = in the past. */
export function daysUntil(iso: string, from: string = todayISO()): number {
  return Math.round((parseISODate(iso).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

/** 0 → "today", 1 → "tomorrow", 12 → "in 12 days", -6 → "6 days ago", 95 → "in 3 months" */
export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  const abs = Math.abs(days);
  let span: string;
  if (abs < 60) span = `${abs} days`;
  else if (abs < 365) span = `${Math.round(abs / 30)} months`;
  else {
    const years = Math.round((abs / 365) * 10) / 10;
    span = `${years} ${years === 1 ? "year" : "years"}`;
  }
  return days > 0 ? `in ${span}` : `${span} ago`;
}

export type Urgency = "overdue" | "week" | "month" | "later";

export function urgencyOf(days: number): Urgency {
  if (days < 0) return "overdue";
  if (days <= 7) return "week";
  if (days <= 31) return "month";
  return "later";
}

export const URGENCY_LABELS: Record<Urgency, string> = {
  overdue: "Overdue",
  week: "This week",
  month: "This month",
  later: "Later",
};

/** 1536 → "1.5 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "Good morning" / "Good afternoon" / "Good evening", by IST hour. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: IST }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
