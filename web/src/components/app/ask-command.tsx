"use client";

import { ArrowRight, CalendarClock, FileText, MessageCircleQuestion, Settings, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { DocTypeTile } from "@/components/documents/doc-bits";
import { findDocuments, loadSuggestions } from "@/lib/data/actions";

type AskCommandContext = { open: () => void };
const Ctx = createContext<AskCommandContext>({ open: () => {} });

/** Opens the global ask box from anywhere: `const { open } = useAskCommand()`. */
export function useAskCommand() {
  return use(Ctx);
}

/**
 * ⌘K / Ctrl+K anywhere in the app: type a question and press Enter to ask it,
 * or jump to a page. Wraps the app shell so any button can open it.
 */
export function AskCommandProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );
  const ask = (question: string) => go(`/vault/ask?q=${encodeURIComponent(question.trim())}`);

  const value = useMemo(() => ({ open: () => setOpen(true) }), []);

  // Suggestions from your documents, fetched the first time the palette opens.
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  useEffect(() => {
    if (isOpen && suggestions === null) void loadSuggestions().then(setSuggestions, () => setSuggestions([]));
  }, [isOpen, suggestions]);
  const typed = query.trim();

  // Documents whose name matches what's typed, fetched as you type (debounced).
  const [docs, setDocs] = useState<Awaited<ReturnType<typeof findDocuments>>>([]);
  useEffect(() => {
    if (typed.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      void findDocuments(typed).then((found) => live && setDocs(found));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [typed]);
  const shownDocs = typed.length < 2 ? [] : docs;

  // We filter ourselves (shouldFilter={false}) so "Ask …" always stays first: Enter asks
  // the question unless you arrow down to something else.
  const matches = (text: string) => !typed || text.toLowerCase().includes(typed.toLowerCase());
  const pages = [
    { label: "Documents", keywords: "documents library", href: "/vault/documents", icon: FileText },
    { label: "Upload a document", keywords: "upload add document", href: "/vault/documents?upload=1", icon: Upload },
    { label: "Timeline", keywords: "timeline deadlines reminders", href: "/vault/timeline", icon: CalendarClock },
    { label: "Settings", keywords: "settings account", href: "/vault/settings", icon: Settings },
  ].filter((p) => matches(`${p.label} ${p.keywords}`));
  const examples = (suggestions ?? []).filter(matches).slice(0, 4);

  return (
    <Ctx value={value}>
      {children}
      <CommandDialog
        open={isOpen}
        onOpenChange={setOpen}
        title="Ask Life Vault"
        // Phones: open near the top, so the on-screen keyboard doesn't cover the list.
        className="max-sm:top-3"
        description="Ask a question about your documents, or jump to a page."
      >
        <Command shouldFilter={false}>
          <CommandInput placeholder="Ask anything about your documents…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Type a question and press Enter.</CommandEmpty>
            {typed && (
              <CommandGroup heading="Ask">
                <CommandItem value={`ask ${typed}`} onSelect={() => ask(typed)}>
                  <MessageCircleQuestion />
                  <span className="truncate">Ask “{typed}”</span>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            )}
            {shownDocs.length > 0 && (
              <CommandGroup heading="Documents">
                {shownDocs.map((d) => (
                  <CommandItem key={d.id} value={`doc ${d.id}`} onSelect={() => go(`/vault/documents/${d.id}`)}>
                    <DocTypeTile type={d.docType} className="size-6 [&_svg]:size-3.5" />
                    <span className="truncate">{d.title}</span>
                    {d.vendor && <span className="ml-auto truncate text-xs text-muted-foreground">{d.vendor}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {examples.length > 0 && (
              <CommandGroup heading="Try asking">
                {examples.map((q) => (
                  <CommandItem key={q} value={q} onSelect={() => ask(q)}>
                    <ArrowRight className="text-muted-foreground" />
                    {q}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {pages.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Go to">
                  {pages.map((p) => (
                    <CommandItem key={p.href} value={p.href} onSelect={() => go(p.href)}>
                      <p.icon /> {p.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </Ctx>
  );
}
