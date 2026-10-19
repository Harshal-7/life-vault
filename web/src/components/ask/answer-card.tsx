"use client";

import { FileSearch, RotateCw, Sparkles, ThumbsDown, ThumbsUp, Upload } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { DocTypeTile } from "@/components/documents/doc-bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Answer } from "@/hooks/use-ask";
import { sendFeedback } from "@/lib/data/actions";
import type { Citation } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const THINKING_LABEL = {
  field_lookup: "Looking up the exact details…",
  content_search: "Reading the relevant pages…",
  both: "Searching your documents…",
} as const;

/** Link that opens the cited document at the right page with the passage highlighted. */
export function citationHref(c: Citation): string {
  const sp = new URLSearchParams({ page: String(c.page) });
  if (c.box) sp.set("hl", [c.box.x, c.box.y, c.box.w, c.box.h].join(","));
  return `/vault/documents/${c.documentId}?${sp}`;
}

export function AnswerCard({ answer, onRetry }: { answer: Answer; onRetry: (q: string) => void }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const waiting = answer.status === "thinking";

  return (
    <article className="overflow-hidden rounded-2xl border bg-card" aria-busy={answer.status !== "done" && answer.status !== "error"}>
      <header className="flex items-start gap-2 border-b bg-muted/40 px-4 py-3 text-sm">
        <span className="mt-0.5 font-medium text-muted-foreground">Q</span>
        <p className="font-medium">{answer.question}</p>
      </header>

      <div className="space-y-4 p-4 md:p-5">
        {waiting && (
          <div className="space-y-3" role="status">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4 animate-pulse text-primary" />
              {THINKING_LABEL[answer.route ?? "both"]}
            </p>
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}

        {answer.status === "error" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-destructive">Couldn&apos;t get an answer. {answer.error}</p>
            <Button variant="outline" size="sm" onClick={() => onRetry(answer.question)}>
              <RotateCw /> Try again
            </Button>
          </div>
        )}

        {answer.notFound && (
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FileSearch className="size-5" />
            </span>
            <div className="space-y-3">
              <p className="text-sm">{answer.notFound}</p>
              <Button asChild size="sm" variant="outline">
                <Link href="?upload=1">
                  <Upload /> Upload a document
                </Link>
              </Button>
            </div>
          </div>
        )}

        {answer.fact && (
          <div className="rounded-xl bg-accent/60 px-4 py-3">
            <p className="text-xs font-medium tracking-wide text-accent-foreground/80 uppercase">{answer.fact.label}</p>
            <p className="tabular mt-0.5 text-2xl font-semibold tracking-tight text-accent-foreground md:text-3xl">{answer.fact.value}</p>
            {answer.fact.detail && <p className="mt-0.5 text-sm text-accent-foreground/80">{answer.fact.detail}</p>}
          </div>
        )}

        {answer.text && (
          <p className="leading-relaxed" aria-live="polite">
            {answer.text}
            {answer.status === "streaming" && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary align-middle" />}
          </p>
        )}

        {answer.citations.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {answer.citations.length === 1 ? "Source" : `${answer.citations.length} sources`}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {answer.citations.map((c, i) => (
                <li key={`${c.documentId}-${i}`}>
                  <SourceCard citation={c} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {answer.status === "done" && answer.askId && !answer.notFound && (
          <div className="flex items-center gap-1 border-t pt-3 text-xs text-muted-foreground">
            <span className="mr-1">Was this right?</span>
            {(["up", "down"] as const).map((v) => (
              <Button
                key={v}
                variant="ghost"
                size="icon"
                className={cn("size-8", vote === v && "bg-accent text-accent-foreground")}
                aria-label={v === "up" ? "Yes, correct" : "No, wrong"}
                aria-pressed={vote === v}
                onClick={() => {
                  setVote(v);
                  void sendFeedback(answer.askId!, v);
                }}
              >
                {v === "up" ? <ThumbsUp /> : <ThumbsDown />}
              </Button>
            ))}
            {vote && <span className="ml-1">Thanks, noted.</span>}
          </div>
        )}
      </div>
    </article>
  );
}

function SourceCard({ citation: c }: { citation: Citation }) {
  return (
    <Link
      href={citationHref(c)}
      className="flex gap-3 rounded-xl border p-2 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md border bg-white">
        {c.thumbnailUrl ? (
          <>
            <Image src={c.thumbnailUrl} alt="" fill unoptimized className="object-cover object-top" sizes="48px" />
            {c.box && (
              <span
                aria-hidden
                className="absolute bg-amber-400/60"
                style={{ left: `${c.box.x}%`, top: `${c.box.y}%`, width: `${c.box.w}%`, height: `${Math.max(c.box.h, 2)}%` }}
              />
            )}
          </>
        ) : (
          <DocTypeTile type={c.docType} className="size-full rounded-none" />
        )}
      </span>
      <span className="min-w-0 flex-1 py-0.5">
        <span className="block truncate text-sm font-medium">{c.title}</span>
        <span className="line-clamp-2 text-xs text-muted-foreground">{c.snippet}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">Page {c.page}</span>
      </span>
    </Link>
  );
}

export function AnswerSkeleton() {
  return <Skeleton className="h-48 w-full rounded-2xl" />;
}
