import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { planAnswer } from "@/lib/data/mock/ask";
import { allDocuments, findEntry, recordAsk } from "@/lib/data/mock/store";
import type { AskEvent } from "@/lib/data/types";
import { encodeEvent } from "@/lib/sse";

/**
 * POST { question } → a stream of AskEvents (Server-Sent Events).
 * Demo mode answers from keyword rules with realistic pacing.
 * TODO(api): proxy FastAPI `POST /ask` (SSE) here, passing the user's access token.
 */
export async function POST(request: NextRequest) {
  await getCurrentUser();
  const body = (await request.json().catch(() => ({}))) as { question?: unknown };
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  if (!question) return Response.json({ error: "Ask a question first." }, { status: 400 });

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
