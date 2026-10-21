"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";

import * as api from "./api-source";
import * as mock from "./mock/store";
import type { DocFields, DocType, Settings, UploadRequest, UploadResult } from "./types";

/**
 * Every change the UI makes. Each action re-checks who's signed in (never trust the
 * page that called it), then refreshes the pages that show the changed data.
 * Demo mode writes to the mock store; otherwise these call FastAPI.
 */

const refresh = () => revalidatePath("/vault", "layout");

/** Step 1 of an upload: returns a one-time URL the browser PUTs the file to (real backend). */
export async function createUpload(req: UploadRequest): Promise<UploadResult> {
  await getCurrentUser();
  const result = isDemoMode() ? mock.addUpload(req) : await api.createUpload(req);
  refresh();
  return result;
}

/** Step 2 of an upload, after the file reached storage: queue it for reading. */
export async function completeUpload(id: string): Promise<{ ok: boolean; error?: string }> {
  await getCurrentUser();
  if (isDemoMode()) return { ok: true };
  try {
    await api.completeUpload(id);
    refresh();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload couldn't finish." };
  }
}

export async function retryDocument(id: string) {
  await getCurrentUser();
  if (isDemoMode()) mock.retryUpload(id);
  else await api.retryDocument(id);
  refresh();
}

export async function saveFields(id: string, fields: DocFields, confirm: boolean) {
  await getCurrentUser();
  try {
    const ok = isDemoMode() ? Boolean(mock.updateFields(id, fields, confirm)) : (await api.saveFields(id, fields, confirm), true);
    refresh();
    return { ok };
  } catch {
    return { ok: false };
  }
}

export async function updateDocument(id: string, patch: { title?: string; docType?: DocType; tags?: string[] }) {
  await getCurrentUser();
  try {
    if (isDemoMode()) mock.updateDocument(id, patch);
    else await api.updateDocument(id, patch);
    refresh();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function deleteDocument(id: string) {
  await getCurrentUser();
  try {
    const ok = isDemoMode() ? mock.deleteDocument(id) : (await api.deleteDocument(id), true);
    refresh();
    return { ok };
  } catch {
    return { ok: false };
  }
}

// TODO(api, M3): PATCH /deadlines/{id}
export async function setReminder(deadlineId: string, on: boolean) {
  await getCurrentUser();
  if (isDemoMode()) mock.setReminder(deadlineId, on);
  refresh();
}

export async function sendFeedback(askId: string, value: "up" | "down") {
  await getCurrentUser();
  if (isDemoMode()) mock.setFeedback(askId, value);
  else await api.sendFeedback(askId, value).catch(() => undefined); // a lost vote isn't worth an error
}

// TODO(api, M4): PATCH /settings. Until then changes only last in demo mode.
export async function saveSettings(patch: Partial<Pick<Settings, "allowedSenders" | "reminderDays">>) {
  const user = await getCurrentUser();
  if (!isDemoMode()) {
    return { email: user.email, inboundAddress: "", allowedSenders: [user.email], reminderDays: [30, 7, 1], ...patch };
  }
  const settings = mock.updateSettings(patch);
  revalidatePath("/vault/settings");
  return settings;
}
