import { signOut } from "@/app/vault/actions";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";

import { UserMenu } from "./user-menu";

/** Server part of the user menu: reads who's signed in (so keep it inside <Suspense>). */
export async function AccountMenu({ variant }: { variant: "compact" | "full" }) {
  const user = await getCurrentUser();
  return <UserMenu email={user.email} demo={isDemoMode()} signOut={signOut} variant={variant} />;
}

export function AccountMenuSkeleton({ variant }: { variant: "compact" | "full" }) {
  return variant === "full" ? (
    <div className="flex items-center gap-2 p-2">
      <Skeleton className="size-8 rounded-full" />
      <Skeleton className="h-4 flex-1" />
    </div>
  ) : (
    <Skeleton className="size-8 rounded-full" />
  );
}
