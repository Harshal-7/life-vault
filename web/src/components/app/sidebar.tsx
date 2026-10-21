"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { isActive, NAV_ITEMS } from "./nav-items";

/**
 * Tablet and desktop navigation. From md to xl it's a slim icon rail (labels in
 * tooltips) so tablets keep room for content; from xl it's the full labelled sidebar.
 * `footer` (avatar + email) and `railFooter` (avatar only) hold the user menu,
 * rendered on the server.
 */
export function Sidebar({ footer, railFooter }: { footer: React.ReactNode; railFooter: React.ReactNode }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col items-center border-r bg-sidebar px-2 py-4 md:flex xl:w-60 xl:items-stretch xl:px-3">
      <Link href="/vault" className="mb-6 xl:px-2" aria-label="Life Vault home">
        <LogoMark className="xl:hidden" />
        <Logo className="hidden xl:inline-flex" />
      </Link>

      <RailTip label="Upload">
        <Button asChild className="mb-4 h-9 w-10 gap-2 px-0 xl:w-auto xl:justify-start xl:px-2.5">
          <Link href="/vault/documents?upload=1">
            <Upload /> <span className="sr-only xl:not-sr-only">Upload</span>
          </Link>
        </Button>
      </RailTip>

      {/* The current path is request data on dynamic routes, so the active state streams in. */}
      <Suspense fallback={<NavLinks pathname={null} />}>
        <LiveNavLinks />
      </Suspense>

      <div className="mt-auto">
        <div className="hidden xl:block">{footer}</div>
        <div className="xl:hidden">{railFooter}</div>
      </div>
    </aside>
  );
}

/** A tooltip with the label, only while the sidebar is a rail. */
function RailTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="xl:hidden">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function LiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = pathname !== null && isActive(item, pathname);
        return (
          <RailTip key={item.href} label={item.label}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex size-10 items-center justify-center gap-3 rounded-lg text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground xl:h-9 xl:w-auto xl:justify-start xl:px-2.5",
                active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-[18px] xl:size-4" />
              <span className="sr-only xl:not-sr-only">{item.label}</span>
            </Link>
          </RailTip>
        );
      })}
    </nav>
  );
}
