import { Suspense } from "react";

import { AccountMenu, AccountMenuSkeleton } from "@/components/app/account";
import { AskCommandProvider } from "@/components/app/ask-command";
import { BottomNav } from "@/components/app/bottom-nav";
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
