"use client";

import { Search, Upload } from "lucide-react";
import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

import { useAskCommand } from "./ask-command";

/**
 * Phone: logo, upload and the user menu. Desktop: the global ask box (opens ⌘K).
 * `userMenu` is rendered on the server and passed in.
 */
export function TopBar({ userMenu }: { userMenu: React.ReactNode }) {
  const { open } = useAskCommand();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-8">
      <Link href="/vault" className="md:hidden" aria-label="Life Vault home">
        <LogoMark />
      </Link>

      <button
        type="button"
        onClick={open}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted md:max-w-md"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Ask about your documents…</span>
        <kbd className="ml-auto hidden rounded border bg-background px-1.5 font-mono text-[10px] md:inline">⌘K</kbd>
      </button>

      <div className="flex items-center gap-1 md:ml-auto">
        <Button asChild variant="ghost" size="icon" className="size-9 md:hidden" aria-label="Upload">
          <Link href="/vault/documents?upload=1">
            <Upload className="size-[18px]" />
          </Link>
        </Button>
        <div className="md:hidden">{userMenu}</div>
      </div>
    </header>
  );
}
