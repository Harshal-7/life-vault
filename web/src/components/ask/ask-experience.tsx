"use client";

import { ArrowRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAsk } from "@/hooks/use-ask";
import { STARTER_QUESTIONS } from "@/lib/starter-questions";

import { AnswerCard } from "./answer-card";
import { AskBar } from "./ask-bar";

/**
 * The Ask page: question box on top, answers below (newest first).
 * A question in the URL (?q=…, e.g. from Home or ⌘K) is asked on arrival.
 * `voice` renders the mic button and receives the ask function.
 */
export function AskExperience({
  recent,
  voice,
}: {
  recent: React.ReactNode;
  voice?: (ask: (q: string) => void) => React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { answers, ask } = useAsk();
  const busy = answers[0]?.status === "thinking" || answers[0]?.status === "streaming";

  const submit = (q: string) => {
    // Keep the question in the URL so refresh, back and sharing work.
    router.replace(`${pathname}?q=${encodeURIComponent(q)}`, { scroll: false });
    void ask(q);
  };

  // Ask the question from the URL once, when arriving with ?q=. Deferred a tick so
  // React's dev-mode double mount cancels the timer, not an in-flight request.
  const asked = useRef(false);
  const q = params.get("q");
  useEffect(() => {
    if (!q || asked.current) return;
    const t = setTimeout(() => {
      asked.current = true;
      void ask(q);
    }, 0);
    return () => clearTimeout(t);
  }, [q, ask]);

  // Refresh the "recent questions" list after each answer finishes.
  const lastDone = answers[0]?.status === "done" ? answers[0].id : null;
  useEffect(() => {
    if (lastDone) router.refresh();
  }, [lastDone, router]);

  return (
    <div className="space-y-6">
      <AskBar onAsk={submit} busy={busy} autoFocus={!q} size="hero" trailing={voice?.(submit)} />

      {answers.length === 0 && !q ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Try asking</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {STARTER_QUESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => submit(s)}
                    className="group flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-muted"
                  >
                    {s}
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {recent}
        </div>
      ) : (
        <div className="space-y-4">
          {answers.map((a) => (
            <AnswerCard key={a.id} answer={a} onRetry={submit} />
          ))}
        </div>
      )}
    </div>
  );
}
