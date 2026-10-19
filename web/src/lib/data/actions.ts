"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";

import * as mock from "./mock/store";
import type { DocFields, DocType, Settings, UploadRequest, UploadResult } from "./types";

/**
 * Every change the UI makes. Each action re-checks who's signed in (never trust the
 * page that called it), then refreshes the pages that show the changed data.
 */

// TODO(api): POST /documents/upload-url, then PUT the file, then POST /documents
export async function createUpload(req: UploadRequest): Promise<UploadResult> {
  await getCurrentUser();
  const result = mock.addUpload(req);
  revalidatePath("/vault", "layout");
  return result;
}

// TODO(api): POST /documents/{id}/retry
export async function retryDocument(id: string) {
  await getCurrentUser();
  mock.retryUpload(id);
  revalidatePath("/vault", "layout");
}

// TODO(api): PATCH /documents/{id}/fields
export async function saveFields(id: string, fields: DocFields, confirm: boolean) {
  await getCurrentUser();
  const doc = mock.updateFields(id, fields, confirm);
  revalidatePath("/vault", "layout");
  return { ok: Boolean(doc) };
}

// TODO(api): PATCH /documents/{id}
export async function updateDocument(id: string, patch: { title?: string; docType?: DocType; tags?: string[] }) {
  await getCurrentUser();
  const doc = mock.updateDocument(id, patch);
  revalidatePath("/vault", "layout");
  return { ok: Boolean(doc) };
}

// TODO(api): DELETE /documents/{id}
export async function deleteDocument(id: string) {
  await getCurrentUser();
  const ok = mock.deleteDocument(id);
  revalidatePath("/vault", "layout");
  return { ok };
}

// TODO(api): PATCH /deadlines/{id}
export async function setReminder(deadlineId: string, on: boolean) {
  await getCurrentUser();
  mock.setReminder(deadlineId, on);
  revalidatePath("/vault", "layout");
}

// TODO(api): POST /asks/{id}/feedback
export async function sendFeedback(askId: string, value: "up" | "down") {
  await getCurrentUser();
  mock.setFeedback(askId, value);
}

// TODO(api): PATCH /settings
export async function saveSettings(patch: Partial<Pick<Settings, "allowedSenders" | "reminderDays">>) {
  await getCurrentUser();
  const settings = mock.updateSettings(patch);
  revalidatePath("/vault/settings");
  return settings;
}
