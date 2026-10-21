import "server-only";

import { isDemoMode } from "@/lib/demo";

/**
 * Which features actually work for a signed-in user. Demo mode shows everything (on
 * fake data); the real app turns each one on when its milestone ships, so nothing
 * pretends to work before then (docs/ui-tracker.md #43).
 */
export function features() {
  const demo = isDemoMode();
  return {
    /** Timeline, "Coming up" and reminder switches: GET /deadlines (M3). */
    deadlines: demo,
    /** Reminder-day choices in Settings (M3/M4). */
    reminderSettings: demo,
    /** Forwarding address and accepted senders (M4). */
    inbound: demo,
    /** Asking out loud (M5). */
    voice: demo,
    /** Deleting the whole account from Settings. */
    deleteAccount: demo,
  };
}

export type Features = ReturnType<typeof features>;
