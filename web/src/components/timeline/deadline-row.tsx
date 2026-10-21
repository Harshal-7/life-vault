"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { DocTypeTile } from "@/components/documents/doc-bits";
import { Switch } from "@/components/ui/switch";
import { setReminder } from "@/lib/data/actions";
import type { Deadline } from "@/lib/data/types";
import { DEADLINE_LABELS, deadlineLabel } from "@/lib/doc-meta";
import { formatDate, relativeDays } from "@/lib/format";
import { deadlineField } from "@/lib/timeline";
import { cn } from "@/lib/utils";

const month = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });

export function DeadlineRow({ deadline: d }: { deadline: Deadline & { days: number } }) {
  const [on, setOn] = useOptimistic(d.remindersOn);
  const [, startTransition] = useTransition();
  const date = new Date(`${d.dueDate}T00:00:00Z`);
  const tone =
    d.days < 0
      ? "bg-destructive/10 text-destructive"
      : d.days <= 7
        ? "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300"
        : d.days <= 31
          ? "bg-accent text-accent-foreground"
          : "bg-muted text-muted-foreground";

  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-muted py-1.5 leading-none" aria-hidden>
        <span className="text-[11px] font-medium text-muted-foreground uppercase">{month.format(date)}</span>
        <span className="tabular mt-0.5 text-lg font-semibold">{date.getUTCDate()}</span>
      </div>

      <Link
        href={`/vault/documents/${d.documentId}?field=${deadlineField(d.kind)}`}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <DocTypeTile type={d.docType} className="hidden sm:inline-flex" />
        {/* Phones: the pill goes under the title so the title and document name aren't cut short. */}
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="w-full min-w-0 sm:flex-1">
            <span className="block truncate text-sm font-medium">{deadlineLabel(d.kind, d.days)}</span>
            <span className="line-clamp-2 text-xs text-muted-foreground sm:line-clamp-1">{d.documentTitle}</span>
            {/* The date block is decorative, so screen readers get the date here. */}
            <span className="sr-only">{formatDate(d.dueDate)}</span>
          </span>
          <span className={cn("tabular shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", tone)}>
            {relativeDays(d.days)}
          </span>
        </span>
        <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
      </Link>

      {/* No reminder switch once the date has passed: nothing left to remind about. */}
      {d.days >= 0 && (
        <Switch
          checked={on}
          onCheckedChange={(next) =>
            startTransition(async () => {
              setOn(next);
              await setReminder(d.id, next);
              toast(next ? "Reminders on" : "Reminders off", { description: `${DEADLINE_LABELS[d.kind]}: ${d.documentTitle}` });
            })
          }
          aria-label={`Email reminders for ${DEADLINE_LABELS[d.kind].toLowerCase()}, ${d.documentTitle}`}
          className="shrink-0"
        />
      )}
    </li>
  );
}
