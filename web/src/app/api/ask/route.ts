import type { NextRequest } from "next/server";

import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { planAnswer } from "@/lib/data/mock/ask";
import { allDocuments, findEntry, recordAsk } from "@/lib/data/mock/store";
import type { AskEvent } from "@/lib/data/types";
import { encodeEvent } from "@/lib/sse";

/**
 * POST { question } → a stream of AskEvents (Server-Sent Events).
 * Normally this forwards to FastAPI `POST /ask` with the user's access token and pipes
 * its stream straight through. Demo mode answers from keyword rules with realistic pacing.
 */
export async function POST(request: NextRequest) {
  await getCurrentUser();
  const body = (await request.json().catch(() => ({}))) as { question?: unknown };
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  if (!question) return Response.json({ error: "Ask a question first." }, { status: 400 });

  if (!isDemoMode()) {
    // A newer question (or leaving the page) aborts this request, which cancels FastAPI's work too.
    const res = await apiFetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal: request.signal,
    });
    if (!res.ok || !res.body) {
      const detail = await res
        .json()
        .then((b: { detail?: unknown }) => b.detail)
        .catch(() => null);
      return Response.json(
        { error: typeof detail === "string" ? detail : "Couldn't reach your vault. Try again." },
        { status: res.status === 200 ? 502 : res.status },
      );
    }
    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const entries = allDocuments()
    .filter((d) => d.status === "ready" || d.status === "needs_review")
    .map((detail) => ({ detail, demo: findEntry(detail.id)!.demo }));
  const plan = planAnswer(question, entries);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AskEvent) => controller.enqueue(encoder.encode(encodeEvent(e)));
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      try {
        send({ type: "route", route: plan.route });
        await wait(plan.route === "field_lookup" ? 350 : 700);

        if (plan.kind === "not_found") {
          send({ type: "not_found", suggestion: plan.suggestion });
          send({ type: "done", askId: recordAsk(question).id });
          return;
        }
        if (plan.fact) send({ type: "fact", ...plan.fact });
        send({ type: "sources", citations: plan.citations });
        await wait(250);
        // Stream the explanation a few words at a time, like a model would.
        const words = plan.answer.split(/(\s+)/);
        for (let i = 0; i < words.length; i += 4) {
          if (request.signal.aborted) return;
          send({ type: "delta", text: words.slice(i, i + 4).join("") });
          await wait(35);
        }
        send({ type: "done", askId: recordAsk(question, plan.fact?.value).id });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
