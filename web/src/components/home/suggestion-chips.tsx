"use client";

import { useRouter } from "next/navigation";

/** Tappable example questions under Home's ask box; each opens the Ask page with it. */
export function SuggestionChips({ questions }: { questions: string[] }) {
  const router = useRouter();
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_85%,transparent)] md:mx-0 md:flex-wrap md:px-0 md:[mask-image:none]">
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => router.push(`/vault/ask?q=${encodeURIComponent(q)}`)}
          className="tap shrink-0 rounded-full border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
