"use client";

import { useRouter } from "next/navigation";

import { AskBar } from "@/components/ask/ask-bar";
import { MicButton } from "@/components/ask/mic-button";
import { STARTER_QUESTIONS } from "@/lib/starter-questions";

/** Home's ask box: typing or speaking takes you to the Ask page with the answer streaming. */
export function HomeAsk({ voice }: { voice: boolean }) {
  const router = useRouter();
  const go = (q: string) => router.push(`/vault/ask?q=${encodeURIComponent(q)}`);

  return (
    <div className="space-y-3">
      <AskBar onAsk={go} size="hero" trailing={voice ? <MicButton onTranscript={go} /> : undefined} />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_85%,transparent)] md:mx-0 md:flex-wrap md:px-0 md:[mask-image:none]">
        {STARTER_QUESTIONS.slice(0, 3).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => go(q)}
            className="shrink-0 rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
