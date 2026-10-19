import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string };

/**
 * The one place server code asks "who is signed in?". Verifies the session token's
 * signature (getClaims), and sends signed-out visitors to /login.
 * Reads cookies, so call it only inside a <Suspense> boundary.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return { id: data.claims.sub, email: String(data.claims.email ?? "") };
}
