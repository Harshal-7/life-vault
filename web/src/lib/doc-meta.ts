import {
  BookOpen,
  File,
  HeartPulse,
  House,
  IdCard,
  Landmark,
  type LucideIcon,
  Receipt,
  ReceiptText,
  ShieldCheck,
  Umbrella,
} from "lucide-react";

import type { DeadlineKind, DocStatus, DocType } from "@/lib/data/types";

export type DocTypeMeta = {
  label: string;
  plural: string;
  icon: LucideIcon;
  /** Tailwind classes for the small coloured icon tile. */
  tile: string;
};

export const DOC_TYPE_META: Record<DocType, DocTypeMeta> = {
  bill: {
    label: "Bill",
    plural: "Bills",
    icon: ReceiptText,
    tile: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  },
  receipt: {
    label: "Receipt",
    plural: "Receipts",
    icon: Receipt,
    tile: "bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300",
  },
  warranty: {
    label: "Warranty",
    plural: "Warranties",
    icon: ShieldCheck,
    tile: "bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300",
  },
  insurance: {
    label: "Insurance",
    plural: "Insurance",
    icon: Umbrella,
    tile: "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-300",
  },
  rent: {
    label: "Rent & property",
    plural: "Rent & property",
    icon: House,
    tile: "bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-300",
  },
  medical: {
    label: "Medical",
    plural: "Medical",
    icon: HeartPulse,
    tile: "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300",
  },
  tax: {
    label: "Tax",
    plural: "Tax",
    icon: Landmark,
    tile: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
  },
  id: {
    label: "ID",
    plural: "IDs",
    icon: IdCard,
    tile: "bg-indigo-100 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-300",
  },
  manual: {
    label: "Manual",
    plural: "Manuals",
    icon: BookOpen,
    tile: "bg-stone-200 text-stone-800 dark:bg-stone-400/15 dark:text-stone-300",
  },
  other: {
    label: "Other",
    plural: "Other",
    icon: File,
    tile: "bg-stone-100 text-stone-700 dark:bg-stone-400/10 dark:text-stone-300",
  },
};

export const STATUS_META: Record<DocStatus, { label: string; dot: string; text: string }> = {
  uploaded: { label: "Uploading", dot: "bg-status-processing", text: "text-status-processing" },
  processing: { label: "Reading…", dot: "bg-status-processing", text: "text-status-processing" },
  needs_review: { label: "Needs review", dot: "bg-status-review", text: "text-status-review" },
  ready: { label: "Ready", dot: "bg-status-ready", text: "text-status-ready" },
  failed: { label: "Couldn't read", dot: "bg-status-failed", text: "text-status-failed" },
};

export const DEADLINE_LABELS: Record<DeadlineKind, string> = {
  warranty_end: "Warranty ends",
  policy_renewal: "Policy renewal",
  agreement_end: "Agreement ends",
  bill_due: "Payment due",
  id_expiry: "Expires",
};

const PAST_DEADLINE_LABELS: Record<DeadlineKind, string> = {
  warranty_end: "Warranty ended",
  policy_renewal: "Policy expired",
  agreement_end: "Agreement ended",
  bill_due: "Payment overdue",
  id_expiry: "Expired",
};

/** "Warranty ends" for upcoming dates, "Warranty ended" once the date has passed. */
export function deadlineLabel(kind: DeadlineKind, days: number): string {
  return days < 0 ? PAST_DEADLINE_LABELS[kind] : DEADLINE_LABELS[kind];
}
