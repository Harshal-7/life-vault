import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";

import { DEMO_USER, isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string };

/**
 * The one place server code asks "who is signed in?". Verifies the session token's
 * signature (getClaims), and sends signed-out visitors to /login.
 * Reads cookies, so call it only inside a <Suspense> boundary.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  if (isDemoMode()) return { ...DEMO_USER };

  // Checking the token's expiry reads the clock; mark this as per-request first so
  // Next doesn't try to prerender it (Cache Components "blocking route" error).
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return { id: data.claims.sub, email: String(data.claims.email ?? "") };
}
