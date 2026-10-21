import { ArrowRight, CalendarCheck, CircleAlert, TriangleAlert, Upload } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/app/auto-refresh";
import { EmptyState, PageContainer } from "@/components/app/page";
import { DocTypeTile } from "@/components/documents/doc-bits";
import { DocumentCard } from "@/components/documents/document-card";
import { HomeAsk } from "@/components/home/home-ask";
import { DeadlineRow } from "@/components/timeline/deadline-row";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { listDeadlines, listDocuments } from "@/lib/data";
import { features } from "@/lib/features";
import { greeting } from "@/lib/format";
import { groupDeadlines } from "@/lib/timeline";

export default function HomePage() {
  return (
    <PageContainer className="max-w-4xl space-y-10">
      <section className="space-y-5 pt-2 md:pt-6">
        <Suspense fallback={<Skeleton className="h-9 w-64" />}>
          <Greeting />
        </Suspense>
        <HomeAsk voice={features().voice} />
      </section>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </PageContainer>
  );
}

async function Greeting() {
  await connection(); // the greeting depends on the time of the request
  const user = await getCurrentUser();
  const name = user.email.split("@")[0]!.split(/[._-]/)[0]!;
  const display = name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
        {greeting()}, {display}
      </h1>
      <p className="mt-1 text-muted-foreground">What do you need from your paperwork today?</p>
    </div>
  );
}

async function Dashboard() {
  await getCurrentUser();
  const [docs, deadlines] = await Promise.all([listDocuments(), listDeadlines()]);

  if (docs.length === 0) {
    return (
      <EmptyState
        icon={Upload}
        title="Start with one document"
        description="A bill, a warranty card, an insurance policy. Add it and ask anything about it."
        action={
          <Button asChild>
            <Link href="?upload=1">
              <Upload /> Upload a document
            </Link>
          </Button>
        }
      />
    );
  }

  const attention = docs.filter((d) => d.status === "needs_review" || d.status === "failed");
  const upcoming = groupDeadlines(deadlines)
    .flatMap((g) => g.items)
    .slice(0, 3);
  const recent = docs.filter((d) => d.status !== "failed").slice(0, 4);
  const processing = docs.some((d) => d.status === "processing" || d.status === "uploaded");

  return (
    <>
      <AutoRefresh active={processing} />

      {attention.length > 0 && (
        <section aria-labelledby="attention">
          <SectionTitle id="attention" title="Needs your attention" />
          {/* grid-cols-1 (minmax(0,1fr)) so a long title truncates instead of widening the page. */}
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {attention.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/vault/documents/${d.id}`}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted"
                >
                  <DocTypeTile type={d.docType} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{d.title}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {d.status === "failed" ? (
                        <>
                          <TriangleAlert className="size-3.5 text-status-failed" /> Couldn&apos;t read. Try again
                        </>
                      ) : (
                        <>
                          <CircleAlert className="size-3.5 text-status-review" /> Check the details we found
                        </>
                      )}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="upcoming">
        <SectionTitle id="upcoming" title="Coming up" href="/vault/timeline" linkLabel="Timeline" />
        {upcoming.length > 0 ? (
          <ul className="space-y-2">
            {upcoming.map((d) => (
              <DeadlineRow key={d.id} deadline={d} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CalendarCheck}
            title={features().deadlines ? "Nothing due soon" : "Reminders are coming soon"}
            description={features().deadlines ? undefined : "Due dates from your documents will show up here."}
            className="py-8"
          />
        )}
      </section>

      <section aria-labelledby="recent">
        <SectionTitle id="recent" title="Recently added" href="/vault/documents" linkLabel={`All ${docs.length}`} />
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {recent.map((d) => (
            <li key={d.id}>
              <DocumentCard doc={d} href={`/vault/documents/${d.id}`} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function SectionTitle({ id, title, href, linkLabel }: { id: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 id={id} className="font-medium">
        {title}
      </h2>
      {href && (
        <Link href={href} className="tap flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          {linkLabel} <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
