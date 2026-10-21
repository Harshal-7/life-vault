"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AskEvent, Citation } from "@/lib/data/types";
import { createParser } from "@/lib/sse";

export type Answer = {
  id: string; // local id, stable while streaming
  question: string;
  status: "thinking" | "streaming" | "done" | "error";
  route?: Extract<AskEvent, { type: "route" }>["route"];
  fact?: { label: string; value: string; detail?: string };
  citations: Citation[];
  text: string;
  notFound?: string;
  askId?: string;
  error?: string;
};

/**
 * Asks /api/ask and builds up the answer as events stream in.
 * Keeps a short thread of answers (newest first) for this visit.
 */
export function useAsk() {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const controller = useRef<AbortController | null>(null);

  // Stop streaming if the page is left mid-answer.
  useEffect(() => () => controller.current?.abort(), []);

  const ask = useCallback(async (raw: string) => {
    const question = raw.trim();
    if (!question) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;

    const id = crypto.randomUUID();
    const update = (patch: Partial<Answer> | ((a: Answer) => Partial<Answer>)) =>
      setAnswers((list) =>
        list.map((a) => (a.id === id ? { ...a, ...(typeof patch === "function" ? patch(a) : patch) } : a)),
      );
    const fresh: Answer = { id, question, status: "thinking", citations: [], text: "" };
    setAnswers((list) => [fresh, ...list].slice(0, 10));

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof body.error === "string" ? body.error : `Ask failed (${res.status})`);
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      const parse = createParser<AskEvent>();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const e of parse(value)) {
          switch (e.type) {
            case "route":
              update({ route: e.route });
              break;
            case "fact":
              update({ fact: { label: e.label, value: e.value, detail: e.detail }, status: "streaming" });
              break;
            case "sources":
              update({ citations: e.citations, status: "streaming" });
              break;
            case "delta":
              update((a) => ({ text: a.text + e.text, status: "streaming" }));
              break;
            case "not_found":
              update({ notFound: e.suggestion });
              break;
            case "error":
              update({ status: "error", error: e.message });
              break;
            case "done":
              // After an error the answer stays marked as failed (with Try again).
              update((a) => ({ askId: e.askId, status: a.status === "error" ? "error" : "done" }));
              break;
          }
        }
      }
      update((a) => (a.status === "done" || a.status === "error" ? {} : { status: "done" }));
    } catch (err) {
      if (abort.signal.aborted) {
        // Replaced by a newer question: drop it if nothing had arrived yet.
        setAnswers((list) => list.filter((a) => a.id !== id || a.text || a.fact || a.notFound));
        update((a) => (a.status === "done" ? {} : { status: "done" }));
        return;
      }
      update({ status: "error", error: err instanceof Error ? err.message : "Something went wrong." });
    }
  }, []);

  return { answers, ask };
}
