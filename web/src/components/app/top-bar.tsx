"use client";

import { Search, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useSyncExternalStore } from "react";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useAskCommand } from "./ask-command";

/**
 * Phone: logo, upload and the user menu. Desktop: the global ask box (opens ⌘K).
 * `userMenu` is rendered on the server and passed in.
 */
export function TopBar({ userMenu }: { userMenu: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 border-b bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-8">
      {/* The path is only known at request time, so it streams in (like the bottom nav). */}
      <Suspense fallback={<BrandAndAsk pathname={null} />}>
        <BrandAndAskForPath />
      </Suspense>

      <div className="ml-auto flex items-center gap-1">
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

function BrandAndAskForPath() {
  return <BrandAndAsk pathname={usePathname()} />;
}

function BrandAndAsk({ pathname }: { pathname: string | null }) {
  const { open } = useAskCommand();
  // Home and Ask already have a big question box; on phones, don't show a second one.
  const pageHasAskBox = pathname === "/vault" || pathname === "/vault/ask";

  return (
    <>
      <Link href="/vault" className="tap flex items-center gap-2 md:hidden" aria-label="Life Vault home">
        <LogoMark />
        {pageHasAskBox && <span className="font-semibold tracking-tight">Life Vault</span>}
      </Link>

      <button
        type="button"
        onClick={open}
        className={cn(
          "tap flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted md:max-w-md",
          pageHasAskBox && "max-md:hidden",
        )}
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Ask about your documents…</span>
        <kbd className="ml-auto hidden rounded border bg-background px-1.5 font-mono text-[10px] md:inline">{useShortcutLabel()}</kbd>
      </button>
    </>
  );
}

const noSubscribe = () => () => {};

/** "⌘K" on Apple devices, "Ctrl K" elsewhere (decided in the browser; ⌘K on the server). */
function useShortcutLabel() {
  return useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "⌘K",
  );
}
