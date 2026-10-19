"use client";

import { MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

import { isActive, NAV_ITEMS } from "./nav-items";

/** Phone navigation: four tabs with a raised Ask button in the middle. */
export function BottomNav() {
  // The current path is request data on dynamic routes, so the active state streams in.
  return (
    <Suspense fallback={<BottomNavView pathname={null} />}>
      <LiveBottomNav />
    </Suspense>
  );
}

function LiveBottomNav() {
  return <BottomNavView pathname={usePathname()} />;
}

function BottomNavView({ pathname }: { pathname: string | null }) {
  const [home, documents, ask, timeline, settings] = NAV_ITEMS;
  const askActive = pathname !== null && isActive(ask!, pathname);

  const tab = (item: (typeof NAV_ITEMS)[number]) => {
    const active = pathname !== null && isActive(item, pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground",
          active && "font-medium text-primary",
        )}
      >
        <item.icon className="size-5" strokeWidth={active ? 2.3 : 1.8} />
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <div className="mx-auto flex max-w-md items-end px-2">
        {tab(home!)}
        {tab(documents!)}
        <div className="flex flex-1 justify-center">
          <Link
            href="/vault/ask"
            aria-label="Ask"
            aria-current={askActive ? "page" : undefined}
            className={cn(
              "-mt-5 mb-1.5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-4 ring-background transition-transform active:scale-95",
            )}
          >
            <MessageCircleQuestion className="size-6" />
          </Link>
        </div>
        {tab(timeline!)}
        {tab(settings!)}
      </div>
    </nav>
  );
}
