import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageContainer, PageHeader } from "@/components/app/page";
import { AskExperience } from "@/components/ask/ask-experience";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { listAskHistory } from "@/lib/data";
import { features } from "@/lib/features";
import { suggestedQuestions } from "@/lib/suggestions";

export const metadata: Metadata = { title: "Ask" };

export default function AskPage() {
  return (
    <PageContainer className="max-w-3xl xl:max-w-5xl">
      <PageHeader title="Ask" description="Answers come only from your documents, with the source to prove it." />
      <Suspense fallback={<Skeleton className="h-14 w-full rounded-2xl" />}>
        <AskWithSuggestions />
      </Suspense>
    </PageContainer>
  );
}

async function AskWithSuggestions() {
  await getCurrentUser();
  return (
    <AskExperience
      voice={features().voice}
      suggestions={await suggestedQuestions(6)}
      recent={
        <Suspense fallback={null}>
          <RecentQuestions />
        </Suspense>
      }
    />
  );
}

async function RecentQuestions() {
  await getCurrentUser();
  const recent = await listAskHistory(6);
  if (recent.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <History className="size-4" /> Recent questions
      </h2>
      <ul className="divide-y rounded-xl border bg-card">
        {recent.map((r) => (
          <li key={r.id}>
            <Link
              href={`/vault/ask?q=${encodeURIComponent(r.question)}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted"
            >
              <span className="truncate">{r.question}</span>
              {r.factValue && <span className="tabular shrink-0 text-xs text-muted-foreground">{r.factValue}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
