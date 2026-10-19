/**
 * Demo mode lets the UI run without Supabase login, on fake data.
 * Turned on by DEMO_MODE=1 in web/.env.local, and ignored in production builds,
 * so it can never switch off authentication on a deployed site.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1" && process.env.NODE_ENV !== "production";
}

export const DEMO_USER = {
  id: "00000000-0000-4000-8000-00000000d3e0",
  email: "demo@lifevault.local",
} as const;
