import { FileText, Loader2, TriangleAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { DocumentSummary } from "@/lib/data/types";
import { keyLine } from "@/lib/doc-display";
import { cn } from "@/lib/utils";

import { DocTypeTile, StatusBadge } from "./doc-bits";

const toneClass = {
  default: "text-muted-foreground",
  warn: "text-amber-700 dark:text-amber-400",
  danger: "text-destructive",
};

function Thumbnail({ doc }: { doc: DocumentSummary }) {
  if (doc.thumbnailUrl) {
    return (
      <Image
        src={doc.thumbnailUrl}
        alt=""
        width={600}
        height={840}
        unoptimized
        className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
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
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b bg-muted/60">
        <Thumbnail doc={doc} />
        <StatusBadge status={doc.status} className="absolute top-2 left-2 shadow-sm" />
        <span className="absolute right-2 bottom-2 rounded-lg bg-card shadow-sm sm:hidden">
          <DocTypeTile type={doc.docType} className="size-7 [&_svg]:size-4" />
        </span>
      </div>
      <div className="flex gap-3 p-3">
        <DocTypeTile type={doc.docType} className="hidden size-8 sm:inline-flex" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 min-h-10 text-sm leading-5 font-medium">{doc.title}</p>
          <p className="truncate text-xs text-muted-foreground">{doc.vendor ?? doc.originalFilename}</p>
          {line && <p className={cn("tabular mt-1 truncate text-xs font-medium", toneClass[line.tone])}>{line.text}</p>}
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
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <DocTypeTile type={doc.docType} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{doc.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {doc.vendor ?? doc.originalFilename}
          {line && (
            <>
              {" · "}
              <span className={cn("tabular", toneClass[line.tone])}>{line.text}</span>
            </>
          )}
        </p>
      </div>
      <StatusBadge status={doc.status} className="shrink-0" />
    </Link>
  );
}
