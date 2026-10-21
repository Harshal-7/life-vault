import { BellRing, CalendarCheck, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState, PageContainer, PageHeader } from "@/components/app/page";
import { DeadlineRow } from "@/components/timeline/deadline-row";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, listDeadlines } from "@/lib/data";
import { features } from "@/lib/features";
import { URGENCY_LABELS } from "@/lib/format";
import { groupDeadlines } from "@/lib/timeline";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Timeline" };

export default function TimelinePage() {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Timeline" description="Warranties, renewals and bills, before they catch you out." />
      <Suspense fallback={<TimelineSkeleton />}>
        <Timeline />
      </Suspense>
    </PageContainer>
  );
}

async function Timeline() {
  await getCurrentUser();
  const [deadlines, settings] = await Promise.all([listDeadlines(), getSettings()]);
  const groups = groupDeadlines(deadlines);

  if (!features().deadlines) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Reminders are coming soon"
        description="Your due dates, renewals and warranty end dates are already being read from your documents. Soon they'll line up here, with an email before each one."
      />
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Nothing coming up"
        description="When you add a warranty, policy, rent agreement or bill, its key dates show up here."
        action={
          <Button asChild>
            <Link href="?upload=1">
              <Upload /> Add a document
            </Link>
          </Button>
        }
      />
    );
  }

  const overdue = groups.find((g) => g.urgency === "overdue")?.items.length ?? 0;
  const week = groups.find((g) => g.urgency === "week")?.items.length ?? 0;
  const days = [...settings.reminderDays].sort((a, b) => b - a);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-muted/60 px-4 py-3 text-sm">
        {overdue > 0 && <span className="font-medium text-destructive">{overdue} overdue</span>}
        <span>
          <span className="font-medium">{week}</span> due this week
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <BellRing className="size-4" />
          Emails {days.join(", ")} {days.length === 1 && days[0] === 1 ? "day" : "days"} before ·{" "}
          <Link href="/vault/settings" className="underline-offset-4 hover:text-foreground hover:underline">
            change
          </Link>
        </span>
      </div>

      {groups.map((g) => (
        <section key={g.urgency} aria-labelledby={`group-${g.urgency}`}>
          <h2
            id={`group-${g.urgency}`}
            className={cn("mb-3 text-sm font-medium", g.urgency === "overdue" ? "text-destructive" : "text-muted-foreground")}
          >
            {URGENCY_LABELS[g.urgency]} <span className="tabular font-normal">· {g.items.length}</span>
          </h2>
          <ul className="space-y-2">
            {g.items.map((d) => (
              <DeadlineRow key={d.id} deadline={d} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading timeline">
      <Skeleton className="h-12 w-full rounded-xl" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}
