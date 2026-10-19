import type { DocStatus, DocType } from "@/lib/data/types";
import { DOC_TYPE_META, STATUS_META } from "@/lib/doc-meta";
import { cn } from "@/lib/utils";

/** Small coloured tile with the document type's icon. */
export function DocTypeTile({ type, className }: { type: DocType; className?: string }) {
  const meta = DOC_TYPE_META[type];
  return (
    <span
      className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", meta.tile, className)}
      title={meta.label}
    >
      <meta.icon className="size-[18px]" aria-hidden />
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

/** Status pill. Hidden for "ready" unless `showReady`, since that's the normal state. */
export function StatusBadge({ status, showReady = false, className }: { status: DocStatus; showReady?: boolean; className?: string }) {
  if (status === "ready" && !showReady) return null;
  const meta = STATUS_META[status];
  const busy = status === "processing" || status === "uploaded";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs font-medium",
        meta.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot, busy && "animate-pulse")} aria-hidden />
      {meta.label}
    </span>
  );
}
