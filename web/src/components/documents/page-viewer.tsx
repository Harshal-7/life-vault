"use client";

import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Box, DocumentPage } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const ZOOMS = [1, 1.5, 2, 3];

/**
 * Shows a document's pages with a highlight box drawn over the cited text.
 * Pages are images; boxes are in % of the page, so they scale with any zoom.
 */
export function PageViewer({
  pages,
  page,
  onPageChange,
  highlight,
  title,
}: {
  pages: DocumentPage[];
  page: number; // 1-based
  onPageChange: (page: number) => void;
  highlight: Box | null;
  title: string;
}) {
  const [zoom, setZoom] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<number | null>(null);
  const current = pages[page - 1];
  const shownHighlight = highlight && highlight.page === page ? highlight : null;

  // Bring the highlighted text into view inside the viewer (not the whole page).
  useEffect(() => {
    const box = scroller.current;
    const el = mark.current;
    if (!shownHighlight || !box || !el) return;
    const b = box.getBoundingClientRect();
    const m = el.getBoundingClientRect();
    box.scrollTo({
      top: box.scrollTop + (m.top - b.top) - (b.height - m.height) / 2,
      left: box.scrollLeft + (m.left - b.left) - (b.width - m.width) / 2,
      behavior: "smooth",
    });
  }, [shownHighlight, zoom]);

  const go = (delta: number) => {
    const next = Math.min(pages.length, Math.max(1, page + delta));
    if (next !== page) onPageChange(next);
  };

  if (!current) return null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-muted/40">
      <div
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label={`${title}, page ${page} of ${pages.length}. Use arrow keys to change page.`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
          if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(ZOOMS.length - 1, z + 1));
          if (e.key === "-") setZoom((z) => Math.max(0, z - 1));
        }}
        onPointerDown={(e) => {
          if (zoom === 0 && e.pointerType === "touch") swipeStart.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (swipeStart.current === null) return;
          const dx = e.clientX - swipeStart.current;
          swipeStart.current = null;
          if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        }}
        className="max-h-[62dvh] overflow-auto p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:max-h-[calc(100dvh-13rem)] md:p-4"
      >
        <div
          className="relative mx-auto bg-white shadow-sm ring-1 ring-black/5 transition-[width] duration-200"
          style={{ width: `${ZOOMS[zoom]! * 100}%`, maxWidth: zoom === 0 ? 640 : undefined }}
        >
          <Image
            src={current.url}
            alt={`${title}, page ${page}`}
            width={current.width}
            height={current.height}
            unoptimized
            priority
            className="h-auto w-full select-none"
            draggable={false}
          />
          {shownHighlight && (
            <div
              ref={mark}
              aria-hidden
              className="pointer-events-none absolute animate-in rounded-[3px] bg-highlight ring-2 ring-amber-500 ring-offset-1 ring-offset-white duration-500 fade-in zoom-in-95"
              style={{
                left: `${shownHighlight.x}%`,
                top: `${shownHighlight.y}%`,
                width: `${shownHighlight.w}%`,
                height: `${shownHighlight.h}%`,
              }}
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t bg-background px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-9" onClick={() => go(-1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <span className="tabular min-w-16 text-center text-sm text-muted-foreground" aria-live="polite">
            {page} / {pages.length}
          </span>
          <Button variant="ghost" size="icon" className="size-9" onClick={() => go(1)} disabled={page >= pages.length} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>

        {pages.length > 1 && (
          <div className="hidden items-center gap-1.5 sm:flex">
            {pages.map((p, i) => (
              <button
                key={p.url}
                type="button"
                onClick={() => onPageChange(i + 1)}
                aria-label={`Page ${i + 1}`}
                aria-current={page === i + 1 ? "page" : undefined}
                className={cn(
                  "h-10 w-8 overflow-hidden rounded border bg-white transition-shadow",
                  page === i + 1 ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100",
                )}
              >
                <Image src={p.url} alt="" width={32} height={45} unoptimized className="h-full w-full object-cover object-top" />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-9" onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} aria-label="Zoom out">
            <ZoomOut />
          </Button>
          <span className="tabular w-10 text-center text-xs text-muted-foreground">{Math.round(ZOOMS[zoom]! * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
            disabled={zoom === ZOOMS.length - 1}
            aria-label="Zoom in"
          >
            <ZoomIn />
          </Button>
        </div>
      </div>
    </div>
  );
}
