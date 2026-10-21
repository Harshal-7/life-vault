import { Suspense } from "react";

import { AccountMenu, AccountMenuSkeleton } from "@/components/app/account";
import { AskCommandProvider } from "@/components/app/ask-command";
import { BottomNav } from "@/components/app/bottom-nav";
import { OfflineBanner } from "@/components/app/offline-banner";
import { Sidebar } from "@/components/app/sidebar";
import { TopBar } from "@/components/app/top-bar";
import { UploadSheet } from "@/components/upload/upload-sheet";
import { features } from "@/lib/features";

/**
 * The signed-in app frame. Static, so it paints instantly; only the account menu
 * waits for the session (inside <Suspense>), as Cache Components requires.
 */
export default function VaultLayout({ children }: LayoutProps<"/vault">) {
  return (
    <AskCommandProvider>
      {/* Keyboard users can jump past the navigation. */}
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh w-full">
        <Sidebar
          footer={
            <Suspense fallback={<AccountMenuSkeleton variant="full" />}>
              <AccountMenu variant="full" />
            </Suspense>
          }
          railFooter={
            <Suspense fallback={<AccountMenuSkeleton variant="compact" />}>
              <AccountMenu variant="compact" />
            </Suspense>
          }
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            userMenu={
              <Suspense fallback={<AccountMenuSkeleton variant="compact" />}>
                <AccountMenu variant="compact" />
              </Suspense>
            }
          />
          <OfflineBanner />
          <main id="main" className="flex-1 pb-28 md:pb-12">
            {children}
          </main>
        </div>
        <BottomNav />
      </div>
      {/* Opens on ?upload=1 from any page. Reads the URL, so it needs a boundary. */}
      <Suspense fallback={null}>
        <UploadSheet inbound={features().inbound} />
      </Suspense>
    </AskCommandProvider>
  );
}
