"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * While something is still processing, re-fetch the page's data every few seconds so
 * statuses update on their own. Stops as soon as nothing is processing.
 * TODO(api): swap for Supabase Realtime on the documents table (RLS already allows it).
 */
export function AutoRefresh({ active, intervalMs = 2500 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
