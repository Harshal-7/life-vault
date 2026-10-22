"use client";

import { LayoutGrid, List, Search, SearchX, Upload, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { EmptyState } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOC_TYPES, type DocType, type DocumentSummary } from "@/lib/data/types";
import { DOC_TYPE_META } from "@/lib/doc-meta";
import { cn } from "@/lib/utils";
import { type LibraryLayout, VIEW_COOKIE } from "@/lib/library-view";

import { DocumentCard, DocumentRow } from "./document-card";

type View = LibraryLayout;

// Remember grid/list per browser in a cookie, so the server renders the right one
// (no grid-then-list jump on load).
const viewStore = {
  get(): View {
    return document.cookie.split("; ").includes(`${VIEW_COOKIE}=list`) ? "list" : "grid";
  },
  set(view: View) {
    document.cookie = `${VIEW_COOKIE}=${view}; path=/vault; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new Event("lv-view"));
  },
  subscribe(cb: () => void) {
    window.addEventListener("lv-view", cb);
    return () => window.removeEventListener("lv-view", cb);
  },
};

export function LibraryView({
  docs,
  counts,
  total,
  initialView,
}: {
  docs: DocumentSummary[];
  counts: Partial<Record<DocType, number>>;
  total: number;
  initialView: View;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const view = useSyncExternalStore(viewStore.subscribe, viewStore.get, () => initialView);

  const activeType = (params.get("type") as DocType | null) ?? "all";
  const [query, setQuery] = useState(params.get("q") ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const update = (next: { q?: string; type?: string }) => {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== "all") sp.set(key, value);
      else sp.delete(key);
    }
    startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  };

  const onSearch = (value: string) => {
    setQuery(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => update({ q: value.trim() }), 250);
  };
  useEffect(() => () => clearTimeout(debounce.current), []);

  const chips = DOC_TYPES.filter((t) => counts[t]);
  const filtered = Boolean(params.get("q") || params.get("type"));

  if (total === 0) {
    return (
      <EmptyState
        icon={Upload}
        title="Your vault is empty"
        description="Add a bill, receipt, warranty or policy. We'll read it and remind you before anything expires."
        action={
          <Button asChild>
            <Link href="?upload=1">
              <Upload /> Upload your first document
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by name, company or tag"
            aria-label="Search documents"
            className="h-10 pl-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => onSearch("")}
              className="absolute top-1/2 right-1 -translate-y-1/2 rounded p-2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="Layout">
          {(["grid", "list"] as const).map((v) => (
            <Button
              key={v}
              variant="ghost"
              size="icon"
              aria-pressed={view === v}
              aria-label={v === "grid" ? "Grid view" : "List view"}
              onClick={() => viewStore.set(v)}
              className={cn("size-9", view === v && "bg-muted text-foreground")}
            >
              {v === "grid" ? <LayoutGrid /> : <List />}
            </Button>
          ))}
        </div>
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        <Chip active={activeType === "all"} onClick={() => update({ type: "all" })} label="All" count={total} />
        {chips.map((t) => (
          <Chip
            key={t}
            active={activeType === t}
            onClick={() => update({ type: t })}
            label={DOC_TYPE_META[t].plural}
            count={counts[t]!}
            icon={DOC_TYPE_META[t].icon}
          />
        ))}
      </div>

      <div className={cn("transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        {docs.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No documents match"
            description={filtered ? "Try a different word, or clear the filters." : undefined}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  update({ q: "", type: "all" });
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : view === "grid" ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {docs.map((d) => (
              <li key={d.id}>
                <DocumentCard doc={d} href={`/vault/documents/${d.id}`} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y rounded-xl border bg-card p-1">
            {docs.map((d) => (
              <li key={d.id}>
                <DocumentRow doc={d} href={`/vault/documents/${d.id}`} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
          {docs.length === total ? `${total} documents` : `Showing ${docs.length} of ${total} documents`}
        </p>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // Taller on phones: the row scrolls sideways, which would clip an invisible hit area.
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors max-md:h-11",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {label}
      <span className={cn("tabular text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}
