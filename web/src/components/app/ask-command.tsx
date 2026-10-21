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
import { STARTER_QUESTIONS } from "@/lib/starter-questions";

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
  const typed = query.trim();

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
        <Command>
        <CommandInput placeholder="Ask anything about your documents…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>Press Enter to ask.</CommandEmpty>
          {typed && (
            <CommandGroup heading="Ask">
              <CommandItem value={`ask ${typed}`} onSelect={() => ask(typed)}>
                <MessageCircleQuestion />
                <span className="truncate">Ask “{typed}”</span>
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading="Try asking">
            {STARTER_QUESTIONS.slice(0, 4).map((q) => (
              <CommandItem key={q} value={q} onSelect={() => ask(q)}>
                <ArrowRight className="text-muted-foreground" />
                {q}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Go to">
            <CommandItem value="documents" onSelect={() => go("/vault/documents")}>
              <FileText /> Documents
            </CommandItem>
            <CommandItem value="upload a document" onSelect={() => go("/vault/documents?upload=1")}>
              <Upload /> Upload a document
            </CommandItem>
            <CommandItem value="timeline deadlines" onSelect={() => go("/vault/timeline")}>
              <CalendarClock /> Timeline
            </CommandItem>
            <CommandItem value="settings" onSelect={() => go("/vault/settings")}>
              <Settings /> Settings
            </CommandItem>
          </CommandGroup>
        </CommandList>
        </Command>
      </CommandDialog>
    </Ctx>
  );
}
