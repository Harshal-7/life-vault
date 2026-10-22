import "server-only";

import { createClient } from "@/lib/supabase/server";

// Local development falls back to the API on this machine. A deployed site must say
// where the API is: silently using localhost there fails every page with "fetch failed".
const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "production" ? null : "http://localhost:8001");

/**
 * Call the FastAPI backend from server code, passing the user's access token.
 * FastAPI verifies the token itself, so the API trusts nothing the web app claims.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session) headers.set("Authorization", `Bearer ${session.access_token}`);

  if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL isn't set for this deployment, so the website can't reach the API.");
  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  } catch (err) {
    // Say where it tried, so the hosting logs show a wrong or sleeping API at a glance.
    console.error(`API unreachable at ${API_URL}${path}:`, err);
    throw err;
  }
}
