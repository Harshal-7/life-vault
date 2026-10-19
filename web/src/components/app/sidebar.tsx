"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { isActive, NAV_ITEMS } from "./nav-items";

/** Desktop navigation (md and up). `footer` holds the user menu, rendered on the server. */
export function Sidebar({ footer }: { footer: React.ReactNode }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 md:flex">
      <Link href="/vault" className="mb-6 px-2" aria-label="Life Vault home">
        <Logo />
      </Link>

      <Button asChild className="mb-4 h-9 justify-start gap-2">
        <Link href="/vault/documents?upload=1">
          <Upload /> Upload
        </Link>
      </Button>

      {/* The current path is request data on dynamic routes, so the active state streams in. */}
      <Suspense fallback={<NavLinks pathname={null} />}>
        <LiveNavLinks />
      </Suspense>

      <div className="mt-auto">{footer}</div>
    </aside>
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
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
