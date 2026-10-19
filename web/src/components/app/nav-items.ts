import { CalendarClock, FileText, House, type LucideIcon, MessageCircleQuestion, Settings } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/vault", label: "Home", icon: House, exact: true },
  { href: "/vault/documents", label: "Documents", icon: FileText },
  { href: "/vault/ask", label: "Ask", icon: MessageCircleQuestion },
  { href: "/vault/timeline", label: "Timeline", icon: CalendarClock },
  { href: "/vault/settings", label: "Settings", icon: Settings },
];

export function isActive(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
