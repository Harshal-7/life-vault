import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/** An honest placeholder for a feature that isn't built yet: says what's coming. */
export function ComingSoon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2.5 rounded-lg border border-dashed p-3 text-sm text-muted-foreground", className)}>
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        <span className="font-medium text-foreground">Coming soon.</span> {children}
      </span>
    </p>
  );
}
