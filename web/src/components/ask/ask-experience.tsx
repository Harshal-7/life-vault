"use client";

import { ArrowRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAsk } from "@/hooks/use-ask";
import { STARTER_QUESTIONS } from "@/lib/starter-questions";
import { cn } from "@/lib/utils";

import { AnswerCard } from "./answer-card";
import { AskBar } from "./ask-bar";
import { MicButton } from "./mic-button";

/**
 * The Ask page: question box on top, answers below (newest first).
 * A question in the URL (?q=…, e.g. from Home or ⌘K) is asked on arrival.
 */
export function AskExperience({ recent, voice }: { recent: React.ReactNode; voice: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { answers, ask } = useAsk();
  const busy = answers[0]?.status === "thinking" || answers[0]?.status === "streaming";

  // The last question asked on this visit. A ?q= that differs from it (⌘K while already
  // here, Back/Forward) is asked; the same one (after submit() rewrote the URL) isn't.
  const lastAsked = useRef<string | null>(null);

  const submit = (q: string) => {
    lastAsked.current = q;
    // Keep the question in the URL so refresh, back and sharing work.
    router.replace(`${pathname}?q=${encodeURIComponent(q)}`, { scroll: false });
    void ask(q);
  };

  // Ask the question in the URL when it changes. Deferred a tick so React's dev-mode
  // double mount cancels the timer, not an in-flight request.
  const q = params.get("q");
  useEffect(() => {
    if (!q || q === lastAsked.current) return;
    const t = setTimeout(() => {
      lastAsked.current = q;
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
      {/* With answers on wide screens, lines up with the answers column. */}
      <div className={cn(answers.length > 0 && "xl:max-w-[calc(100%-19rem)]")}>
        <AskBar onAsk={submit} busy={busy} autoFocus={!q} size="hero" trailing={voice ? <MicButton onTranscript={submit} /> : undefined} />
      </div>

      {answers.length === 0 && !q ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Try asking</h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
        // Wide screens: suggestions and recent questions stay in a side column.
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_17rem] xl:gap-8">
          <div className="space-y-4">
            {answers.map((a) => (
              <AnswerCard key={a.id} answer={a} onRetry={submit} />
            ))}
          </div>
          <aside className="hidden space-y-8 xl:block">
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">Try asking</h2>
              <ul className="space-y-1">
                {STARTER_QUESTIONS.slice(0, 4).map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => submit(s)}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            {recent}
          </aside>
        </div>
      )}
    </div>
  );
}
