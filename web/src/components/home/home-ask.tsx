"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { AskBar } from "@/components/ask/ask-bar";

// Voice code loads only when the mic is shown.
const MicButton = dynamic(() => import("@/components/ask/mic-button").then((m) => m.MicButton), { ssr: false });

/**
 * Home's ask box: typing or speaking takes you to the Ask page with the answer
 * streaming. `suggestions` (chips built from your documents) stream in below.
 */
export function HomeAsk({ voice, suggestions }: { voice: boolean; suggestions: React.ReactNode }) {
  const router = useRouter();
  const go = (q: string) => router.push(`/vault/ask?q=${encodeURIComponent(q)}`);

  return (
    <div className="space-y-3">
      <AskBar onAsk={go} size="hero" trailing={voice ? <MicButton onTranscript={go} /> : undefined} />
      {suggestions}
    </div>
  );
}
