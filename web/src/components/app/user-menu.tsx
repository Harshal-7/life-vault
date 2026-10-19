"use client";

import { LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Props = {
  email: string;
  demo: boolean;
  signOut: () => Promise<void>;
  /** "compact" = avatar only (phone top bar); "full" = avatar + email (sidebar). */
  variant?: "compact" | "full";
};

export function UserMenu({ email, demo, signOut, variant = "compact" }: Props) {
  const { theme, setTheme } = useTheme();
  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          variant === "full" ? "w-full p-2 hover:bg-sidebar-accent" : "p-0.5",
        )}
        aria-label="Account menu"
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">{initial}</AvatarFallback>
        </Avatar>
        {variant === "full" && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{email}</span>
            {demo && <span className="block text-xs text-muted-foreground">Demo mode</span>}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={variant === "full" ? "top" : "bottom"} className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-xs text-muted-foreground">Signed in as</span>
          <span className="block truncate">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild>
          <Link href="/vault/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> {demo ? "Leave demo" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
