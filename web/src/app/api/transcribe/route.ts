import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { STARTER_QUESTIONS } from "@/lib/starter-questions";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // ~30 s of compressed speech is far below this

declare global {
  var __lifeVaultTranscribeTurn: number | undefined;
}

/**
 * POST multipart { audio } → { text }.
 * Demo mode: ignores the audio and returns the next sample question, after a short
 * pause so the "transcribing" state is visible.
 * TODO(api): proxy FastAPI `POST /ask/voice` (speech-to-text: Deepgram vs Sarvam, M5).
 */
export async function POST(request: NextRequest) {
  await getCurrentUser();
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "No audio received." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "That recording is too long. Keep it under 30 seconds." }, { status: 413 });
  }

  await new Promise((r) => setTimeout(r, 700));
  const turn = (globalThis.__lifeVaultTranscribeTurn ?? 0) % STARTER_QUESTIONS.length;
  globalThis.__lifeVaultTranscribeTurn = turn + 1;
  return Response.json({ text: STARTER_QUESTIONS[turn], demo: true });
}
