"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

// Quick checks first (most documents are read in seconds), then slower ones, then stop:
// about 2 minutes in all, so a stuck job doesn't refresh the page forever.
const DELAYS_MS = [2500, 2500, 2500, 2500, 5000, 5000, 5000, 10_000, 10_000, 30_000, 30_000];

/**
 * While something is still processing, re-fetch the page's data now and then so
 * statuses update on their own. Stops as soon as nothing is processing, or after about
 * 2 minutes with a note that it's taking longer than usual.
 * TODO(api): swap for Supabase Realtime on the documents table (RLS already allows it).
 */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (step >= DELAYS_MS.length) {
        toast("Still reading… this is taking longer than usual.", {
          id: "auto-refresh-stalled",
          duration: 10_000,
          action: { label: "Refresh", onClick: () => router.refresh() },
        });
        return;
      }
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") router.refresh();
        step += 1;
        tick();
      }, DELAYS_MS[step]);
    };
    tick();
    return () => clearTimeout(timer);
  }, [active, router]);
  return null;
}
