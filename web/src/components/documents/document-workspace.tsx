"use client";

import { ArrowLeft, Loader2, RotateCw, Trash2, TriangleAlert } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { AutoRefresh } from "@/components/app/auto-refresh";
import { Button } from "@/components/ui/button";
import { retryDocument } from "@/lib/data/actions";
import type { Box, Deadline, DocumentDetail, FieldKey } from "@/lib/data/types";
import { DOC_TYPE_META } from "@/lib/doc-meta";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { DocTypeTile, StatusBadge } from "./doc-bits";
import { DocumentActions } from "./document-actions";
import { FieldsPanel } from "./fields-panel";
import { PageViewer } from "./page-viewer";

/** `?page=2&hl=12.5,40,30,4` → a box on page 2. Links from answers use this. */
function boxFromParams(params: URLSearchParams): Box | null {
  const hl = params.get("hl")?.split(",").map(Number);
  if (!hl || hl.length !== 4 || hl.some((n) => Number.isNaN(n))) return null;
  const [x, y, w, h] = hl as [number, number, number, number];
  return { page: Number(params.get("page")) || 1, x, y, w, h };
}

const SOURCE_LABEL = { upload: "Uploaded", camera: "Photo", email: "Forwarded by email" } as const;

export function DocumentWorkspace({ doc, deadlines }: { doc: DocumentDetail; deadlines: Deadline[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const fieldParam = params.get("field") as FieldKey | null;

  const initialBox = boxFromParams(params) ?? (fieldParam ? (doc.fieldBoxes[fieldParam] ?? null) : null);
  const [highlight, setHighlight] = useState<Box | null>(initialBox);
  const [activeField, setActiveField] = useState<FieldKey | null>(fieldParam);
  const [page, setPage] = useState(initialBox?.page ?? 1);
  const [retrying, startRetry] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const viewer = useRef<HTMLDivElement>(null);

  const showField = (key: FieldKey) => {
    const box = doc.fieldBoxes[key];
    if (!box) return;
    setActiveField(key);
    setHighlight(box);
    setPage(box.page);
    // When the page is stacked (phones, tablets), the viewer may be off-screen.
    const rect = viewer.current?.getBoundingClientRect();
    if (rect && (rect.bottom < 80 || rect.top > window.innerHeight - 80)) {
      viewer.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const back = () => {
    // Go back to the list exactly as it was (search, filters, scroll) when we came from it.
    const cameFromLibrary = document.referrer && new URL(document.referrer).pathname.startsWith("/vault");
    if (cameFromLibrary && window.history.length > 1) router.back();
    else router.push("/vault/documents");
  };

  const processing = doc.status === "processing" || doc.status === "uploaded";

  return (
    <div className="space-y-5">
      <AutoRefresh active={processing} />

      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="-ml-2 size-9 shrink-0" onClick={back} aria-label="Back to documents">
          <ArrowLeft />
        </Button>
        <DocTypeTile type={doc.docType} className="hidden sm:inline-flex" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl leading-tight font-semibold tracking-tight break-words md:text-2xl">{doc.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>
              {DOC_TYPE_META[doc.docType].label}
              {doc.vendor && ` · ${doc.vendor}`}
            </span>
            <StatusBadge status={doc.status} />
          </p>
        </div>
        <DocumentActions doc={doc} deleting={deleting} onDeletingChange={setDeleting} />
      </div>

      {doc.status === "failed" && (
        <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center">
          <TriangleAlert className="size-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="font-medium">We couldn&apos;t read this file</p>
            <p className="text-sm text-muted-foreground">{friendlyError(doc.error)}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={retrying}
              onClick={() =>
                startRetry(async () => {
                  await retryDocument(doc.id);
                  toast("Trying again…");
                  router.refresh();
                })
              }
            >
              {retrying ? <Loader2 className="animate-spin" /> : <RotateCw />} Try again
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(true)} className="text-destructive hover:text-destructive">
              <Trash2 /> Delete
            </Button>
          </div>
        </div>
      )}

      {processing && (
        <div className="flex items-center gap-3 rounded-xl border border-status-processing/40 bg-status-processing/5 p-4 text-sm">
          <Loader2 className="size-5 shrink-0 animate-spin text-status-processing" />
          <p>
            <span className="font-medium">Reading your document…</span>{" "}
            <span className="text-muted-foreground">This usually takes a few seconds. You can leave this page.</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div ref={viewer} className="min-w-0 scroll-mt-20">
          {doc.pages.length > 0 ? (
            <PageViewer pages={doc.pages} page={page} onPageChange={setPage} highlight={highlight} title={doc.title} />
          ) : doc.fileUrl ? (
            <OriginalFile doc={doc} url={doc.fileUrl} />
          ) : doc.status === "failed" ? null : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-xl border bg-muted/40 text-sm text-muted-foreground">
              No preview available
            </div>
          )}
        </div>

        {/* Needs review: on phones and tablets the form comes before the page, so the
            thing to do is on screen first. */}
        <aside className={cn("space-y-4", doc.status === "needs_review" && "max-xl:order-first")}>
          {!processing && doc.status !== "failed" && (
            // Remount the form when the document changes (e.g. after a review is confirmed).
            <FieldsPanel
              key={`${doc.status}-${JSON.stringify(doc.fields)}`}
              doc={doc}
              deadlines={deadlines}
              activeField={activeField}
              onShowField={showField}
            />
          )}

          <section className="rounded-xl border bg-card p-4 text-sm">
            <h2 className="mb-3 font-medium">File</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-muted-foreground">
              <dt>Name</dt>
              <dd className="truncate text-foreground">{doc.originalFilename}</dd>
              <dt>Size</dt>
              <dd className="tabular text-foreground">
                {formatBytes(doc.sizeBytes)} · {doc.pageCount} {doc.pageCount === 1 ? "page" : "pages"}
              </dd>
              <dt>Added</dt>
              <dd className="text-foreground">
                {formatDate(doc.createdAt)} · {SOURCE_LABEL[doc.source]}
              </dd>
            </dl>
            {doc.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {doc.tags.map((t) => (
                  <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/** The worker's errors are already written for people; this covers anything else. */
function friendlyError(error: string | null | undefined): string {
  if (!error || /exception|traceback|error:|\b5\d\d\b/i.test(error)) return "Try a sharper photo or the original PDF.";
  return error;
}

/** While page images don't exist yet (still reading, or it failed), show the original:
 * photos inline, PDFs in the browser's viewer. */
function OriginalFile({ doc, url }: { doc: DocumentDetail; url: string }) {
  const browserImage = doc.mimeType?.startsWith("image/") && !doc.mimeType.includes("hei");
  return (
    <div className="overflow-hidden rounded-xl border bg-muted/40">
      {browserImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
        <img src={url} alt={doc.title} className="mx-auto max-h-[70dvh] w-auto object-contain" />
      ) : doc.mimeType === "application/pdf" ? (
        <iframe src={url} title={doc.title} className="h-[70dvh] w-full bg-white" />
      ) : (
        <p className="p-8 text-center text-sm text-muted-foreground">Preview isn&apos;t available for this file type yet.</p>
      )}
      <div className="flex justify-end border-t bg-background px-3 py-2">
        <a href={url} target="_blank" rel="noreferrer" className="tap text-sm font-medium text-primary underline-offset-4 hover:underline">
          Open original
        </a>
      </div>
    </div>
  );
}
