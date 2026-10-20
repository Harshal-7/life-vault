import "server-only";

import { createClient } from "@/lib/supabase/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

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

  return fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
}
