"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};
const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** The landing page's example warranty ends five months from today, so the picture never
 * shows a date in the past. The page is static, so this is worked out in the browser. */
export function PreviewDate({ fallback }: { fallback: string }) {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 5);
      return fmt.format(d);
    },
    () => fallback,
  );
}
