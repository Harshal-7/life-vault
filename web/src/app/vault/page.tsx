import { Suspense } from "react";

import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

import { signOut } from "./actions";

type Me = { id: string; email: string; created_at: string };

// The frame of the page is static and loads instantly; only <Account> waits for the
// request, because it reads the login cookie.
export default function VaultPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your vault</h1>
        <form action={signOut}>
          <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
            Sign out
          </button>
        </form>
      </header>

      <Suspense fallback={<AccountSkeleton />}>
        <Account />
      </Suspense>

      <p className="text-sm text-neutral-500">Uploads arrive in the next step.</p>
    </main>
  );
}

async function Account() {
  const user = await getCurrentUser();

  // Ask FastAPI who we are: proves the API accepts and verifies our login token.
  let me: Me | null = null;
  let apiError = "";
  try {
    const response = await apiFetch("/me");
    if (response.ok) me = await response.json();
    else apiError = `API answered ${response.status}`;
  } catch {
    apiError = "API is not reachable. Is FastAPI running on port 8000?";
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <p>
        Signed in as <strong>{user.email}</strong>
      </p>
      {me ? (
        <p className="mt-2 text-green-700 dark:text-green-400">
          ✓ API verified your login (user since {new Date(me.created_at).toLocaleDateString()})
        </p>
      ) : (
        <p className="mt-2 text-red-600">✗ {apiError}</p>
      )}
    </section>
  );
}

function AccountSkeleton() {
  return (
    <section className="h-[74px] animate-pulse rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900" />
  );
}
