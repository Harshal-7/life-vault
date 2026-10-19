"use server";

import { redirect } from "next/navigation";

import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  if (isDemoMode()) redirect("/");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
