"use client";

import { Camera, CheckCircle2, CopyCheck, FileUp, Loader2, Mail, RotateCw, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { completeUpload, createUpload } from "@/lib/data/actions";
import type { DocSource, DocumentSummary } from "@/lib/data/types";
import { formatBytes } from "@/lib/format";
import { ACCEPT_ATTR, checkFile } from "@/lib/upload-rules";
import { cn } from "@/lib/utils";

type Item = {
  key: string;
  name: string;
  size: number;
  state: "checking" | "uploading" | "done" | "duplicate" | "rejected" | "error";
  progress: number;
  message?: string;
  doc?: DocumentSummary;
};

/**
 * True once the page has fully loaded and hydrated. Opening a modal earlier (e.g. when
 * the page is loaded with ?upload=1) would mark streamed-in content aria-hidden before
 * React hydrates it, causing a hydration mismatch.
 */
function usePageReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Hydration of streamed sections runs as queued work; an idle callback fires after it.
    // Safari has no requestIdleCallback; a short timeout is close enough there.
    const hasIdle = typeof globalThis.requestIdleCallback === "function";
    let handle = 0;
    const done = () => {
      handle = hasIdle
        ? requestIdleCallback(() => setReady(true), { timeout: 1500 })
        : (setTimeout(() => setReady(true), 300) as unknown as number);
    };
    if (document.readyState === "complete") done();
    else window.addEventListener("load", done, { once: true });
    return () => {
      window.removeEventListener("load", done);
      if (hasIdle) cancelIdleCallback(handle);
      else clearTimeout(handle);
    };
  }, []);
  return ready;
}

/** PUT the file straight to storage with the one-time URL, reporting progress (0–1). */
function putFile(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send(file);
  });
}

/** Some phones send HEIC photos without a MIME type. */
function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
  return (ext && map[ext]) || "application/octet-stream";
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The "add documents" panel. Opens whenever the URL has ?upload=1, so any link or
 * button in the app can open it. Bottom sheet on phones, side panel on desktop.
 */
export function UploadSheet({ inbound }: { inbound: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pageReady = usePageReady();
  const open = params.get("upload") === "1" && pageReady;
  const desktop = useMediaQuery("(min-width: 768px)");

  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("upload");
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  const busy = items.some((i) => i.state === "checking" || i.state === "uploading");

  // Start fresh each time the panel opens (reset during render, React's recommended way),
  // unless uploads from last time are still going.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && !busy) setItems([]);
  }

  // The files themselves, kept for Retry.
  const files = useRef(new Map<string, { file: File; source: DocSource }>());

  const patch = (key: string, p: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));

  /** Upload one file; true when it was added. */
  const uploadOne = async (key: string): Promise<boolean> => {
    const entry = files.current.get(key);
    if (!entry) return false;
    const { file, source } = entry;
    patch(key, { state: "checking", progress: 0, message: undefined });
    const check = checkFile(file);
    if (!check.ok) {
      patch(key, { state: "rejected", message: check.reason });
      return false;
    }
    try {
      const hash = await sha256(file);
      patch(key, { state: "uploading", progress: 0.05 });
      const result = await createUpload({
        filename: file.name,
        sizeBytes: file.size,
        mimeType: file.type || mimeFromName(file.name),
        sha256: hash,
        source,
      });
      if (!result.ok) {
        patch(key, { state: "duplicate", doc: result.existing, message: `Already in your vault as “${result.existing.title}”.` });
        return false;
      }
      if (result.uploadUrl) {
        // Real backend: the file goes straight to private storage, never through our servers.
        await putFile(result.uploadUrl, file, (p) => patch(key, { progress: 0.05 + p * 0.9 }));
        const done = await completeUpload(result.document.id);
        if (!done.ok) throw new Error(done.error);
      } else {
        // Demo mode: simulated progress.
        for (const p of [0.35, 0.6, 0.85]) {
          await new Promise((r) => setTimeout(r, 180 + Math.random() * 220));
          patch(key, { progress: p });
        }
      }
      patch(key, { state: "done", progress: 1, doc: result.document });
      return true;
    } catch (err) {
      patch(key, {
        state: "error",
        message: err instanceof Error && err.message ? err.message : "Upload failed. Check your connection and try again.",
      });
      return false;
    }
  };

  const announceAdded = (added: number) => {
    if (added > 0) {
      toast.success(added === 1 ? "Added 1 document" : `Added ${added} documents`, {
        description: "We're reading it now. You'll see the details in a few seconds.",
      });
      router.refresh();
    }
  };

  const addFiles = async (list: FileList | File[], source: DocSource) => {
    const batch = [...list].map((file) => ({ file, key: `${file.name}-${file.size}-${crypto.randomUUID()}` }));
    for (const { file, key } of batch) files.current.set(key, { file, source });
    setItems((items) => [
      ...batch.map(({ file, key }) => ({ key, name: file.name, size: file.size, state: "checking" as const, progress: 0 })),
      ...items,
    ]);
    // Three at a time: each file is read into memory for its checksum, which adds up
    // on a phone with twenty photos.
    let added = 0;
    const queue = batch.map((b) => b.key);
    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) if (await uploadOne(key)) added++;
    };
    await Promise.all([worker(), worker(), worker()]);
    announceAdded(added);
  };

  const retry = async (key: string) => announceAdded((await uploadOne(key)) ? 1 : 0);
  const dismiss = (key: string) => {
    files.current.delete(key);
    setItems((list) => list.filter((i) => i.key !== key));
  };

  const closeSheet = () => {
    if (busy) toast("Uploads continue in the background.");
    close();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && closeSheet()}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn("flex flex-col gap-0 p-0", desktop ? "w-full sm:max-w-md" : "max-h-[90dvh] rounded-t-2xl")}
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle>Add documents</SheetTitle>
          <SheetDescription>Bills, receipts, warranties, policies. PDFs or photos, up to 20 MB each.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files, "upload");
            }}
            className={cn(
              "flex flex-col items-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
              dragging ? "border-primary bg-accent" : "border-border",
            )}
          >
            <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <FileUp className="size-5" />
            </span>
            <p className="font-medium">
              <span className="hidden md:inline">Drop files here, or </span>
              <span className="md:hidden">Choose files or take a photo</span>
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => fileInput.current?.click()}>
                <FileUp /> Choose files
              </Button>
              <Button variant="outline" onClick={() => cameraInput.current?.click()} className="md:hidden">
                <Camera /> Take a photo
              </Button>
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files?.length) void addFiles(e.target.files, "upload");
                e.target.value = "";
              }}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files?.length) void addFiles(e.target.files, "camera");
                e.target.value = "";
              }}
            />
          </div>

          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item) => (
                <UploadRow key={item.key} item={item} onOpen={close} onRetry={() => void retry(item.key)} onDismiss={() => dismiss(item.key)} />
              ))}
            </ul>
          )}

          {inbound && (
            <div className="flex gap-3 rounded-xl bg-muted/60 p-3 text-sm">
              <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">
                Bills arrive by email? Forward them to your vault address instead.{" "}
                <Link href="/vault/settings" onClick={close} className="font-medium text-foreground underline-offset-4 hover:underline">
                  Find it in Settings
                </Link>
              </p>
            </div>
          )}
        </div>

        <SheetFooter className="border-t">
          {/* Announced once per change in totals, not on every progress tick. */}
          <p className="sr-only" role="status">
            {items.length > 0 && `${items.filter((i) => i.state === "done").length} of ${items.length} added`}
          </p>
          <Button onClick={closeSheet} variant={items.some((i) => i.state === "done") ? "default" : "outline"}>
            {busy ? (
              <>
                <Loader2 className="animate-spin" /> Uploading…
              </>
            ) : (
              "Done"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function UploadRow({ item, onOpen, onRetry, onDismiss }: { item: Item; onOpen: () => void; onRetry: () => void; onDismiss: () => void }) {
  const icon = {
    checking: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
    uploading: <Loader2 className="size-4 animate-spin text-primary" />,
    done: <CheckCircle2 className="size-4 text-status-ready" />,
    duplicate: <CopyCheck className="size-4 text-status-review" />,
    rejected: <X className="size-4 text-destructive" />,
    error: <TriangleAlert className="size-4 text-destructive" />,
  }[item.state];

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <span className="shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(item.size)}
            {item.state === "checking" && " · checking…"}
            {item.state === "uploading" && ` · uploading ${Math.round(item.progress * 100)}%`}
            {item.state === "done" && " · added, reading now"}
          </p>
        </div>
        {(item.state === "done" || item.state === "duplicate") && item.doc && (
          <Button asChild variant="ghost" size="sm" onClick={onOpen}>
            <Link href={`/vault/documents/${item.doc.id}`}>View</Link>
          </Button>
        )}
        {item.state === "error" && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw /> Retry
          </Button>
        )}
        {(item.state === "error" || item.state === "rejected" || item.state === "duplicate") && (
          <Button variant="ghost" size="icon" className="size-8" onClick={onDismiss} aria-label={`Remove ${item.name} from this list`}>
            <X />
          </Button>
        )}
      </div>
      {item.state === "uploading" && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${item.name}`}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${item.progress * 100}%` }} />
        </div>
      )}
      {item.message && (
        <p className={cn("mt-2 text-xs", item.state === "duplicate" ? "text-status-review" : "text-destructive")}>{item.message}</p>
      )}
    </li>
  );
}
