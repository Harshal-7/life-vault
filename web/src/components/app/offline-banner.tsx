"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** A thin notice while the device is offline, so failed actions make sense. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-muted px-4 py-2 text-sm text-muted-foreground">
      <WifiOff className="size-4 shrink-0" /> You&apos;re offline. Changes won&apos;t save until you&apos;re back online.
    </div>
  );
}
