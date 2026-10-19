"use client";

import { ArrowUp, Loader2, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The question box used on Home and the Ask page. `trailing` is where the mic button
 * sits (voice input fills the box, then submits like a typed question).
 */
export function AskBar({
  onAsk,
  busy = false,
  autoFocus = false,
  size = "default",
  placeholder = "Ask about your documents…",
  trailing,
  value: controlled,
  onValueChange,
}: {
  onAsk: (question: string) => void;
  busy?: boolean;
  autoFocus?: boolean;
  size?: "default" | "hero";
  placeholder?: string;
  trailing?: React.ReactNode;
  value?: string;
  onValueChange?: (v: string) => void;
}) {
  const [local, setLocal] = useState("");
  const value = controlled ?? local;
  const setValue = onValueChange ?? setLocal;
  const hero = size === "hero";

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim() || busy) return;
        onAsk(value.trim());
        setValue("");
      }}
      className={cn(
        "flex items-center gap-2 rounded-2xl border bg-card pl-4 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        hero ? "h-14 pr-2" : "h-12 pr-1.5",
      )}
    >
      <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Your question"
        autoFocus={autoFocus}
        enterKeyHint="send"
        maxLength={500}
        className={cn("min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground", hero && "text-base md:text-lg")}
      />
      {trailing}
      <Button
        type="submit"
        size="icon"
        disabled={!value.trim() || busy}
        aria-label="Ask"
        className={cn("shrink-0 rounded-xl", hero ? "size-10" : "size-9")}
      >
        {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
      </Button>
    </form>
  );
}
