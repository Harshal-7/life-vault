import { FileText, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";

import type { DocumentSummary } from "@/lib/data/types";
import { keyLine } from "@/lib/doc-display";
import { SignedImage } from "@/components/app/signed-image";
import { cn } from "@/lib/utils";

import { DocTypeTile, StatusBadge } from "./doc-bits";

const toneClass = {
  default: "text-muted-foreground",
  warn: "text-warning",
  danger: "text-destructive",
};

function Thumbnail({ doc }: { doc: DocumentSummary }) {
  if (doc.thumbnailUrl) {
    return (
      <SignedImage
        src={doc.thumbnailUrl}
        alt=""
        width={600}
        height={840}
        unoptimized
        // PDFs: the top of the page (letterhead, title). Photos: the middle, since the
        // top is often table or background around the paper.
        className={cn(
          "h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]",
          doc.mimeType?.startsWith("image/") ? "object-center" : "object-top",
        )}
      />
    );
  }
  const busy = doc.status === "processing" || doc.status === "uploaded";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
      {doc.status === "failed" ? (
        <TriangleAlert className="size-6 text-status-failed" />
      ) : busy ? (
        <Loader2 className="size-6 animate-spin" />
      ) : (
        // No page image (e.g. read before page images existed): show what kind of file it is.
        <>
          <FileText className="size-8" strokeWidth={1.5} />
          <span className="text-[11px] font-medium tracking-wide uppercase">
            {doc.mimeType === "application/pdf" ? "PDF" : (doc.mimeType?.split("/")[1] ?? "File")}
          </span>
        </>
      )}
    </div>
  );
}

export function DocumentCard({ doc, href }: { doc: DocumentSummary; href: string }) {
  const line = keyLine(doc);
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring"
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b bg-muted/60">
        <Thumbnail doc={doc} />
        <StatusBadge status={doc.status} className="absolute top-2 left-2 shadow-sm" />
      </div>
      <div className="flex gap-3 p-3">
        <DocTypeTile type={doc.docType} className="hidden size-8 sm:inline-flex" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 min-h-10 text-sm leading-snug font-medium">{doc.title}</p>
          <p className="truncate text-xs text-muted-foreground">{doc.vendor ?? doc.originalFilename}</p>
          {/* The most useful line (amount, due date): allowed to wrap rather than be cut. */}
          {line && <p className={cn("tabular mt-1 line-clamp-2 text-xs font-medium", toneClass[line.tone])}>{line.text}</p>}
        </div>
      </div>
    </Link>
  );
}

export function DocumentRow({ doc, href }: { doc: DocumentSummary; href: string }) {
  const line = keyLine(doc);
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
    >
      <DocTypeTile type={doc.docType} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{doc.title}</p>
        <p className="truncate text-xs text-muted-foreground">{doc.vendor ?? doc.originalFilename}</p>
        {line && <p className={cn("tabular truncate text-xs font-medium", toneClass[line.tone])}>{line.text}</p>}
      </div>
      <StatusBadge status={doc.status} className="shrink-0" />
    </Link>
  );
}
