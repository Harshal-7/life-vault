"use client";

import { BellRing, CircleAlert, Crosshair, Loader2, Pencil, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveFields } from "@/lib/data/actions";
import type { Deadline, DocFields, DocumentDetail, FieldKey } from "@/lib/data/types";
import { deadlineLabel } from "@/lib/doc-meta";
import { fieldLabel, fieldsFor, LOW_CONFIDENCE } from "@/lib/field-labels";
import { daysUntil, formatDate, formatINR, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

type Draft = Record<FieldKey, string>;

function toDraft(fields: DocFields): Draft {
  return {
    vendor: fields.vendor ?? "",
    amount: fields.amount !== undefined ? String(fields.amount) : "",
    docDate: fields.docDate ?? "",
    expiryDate: fields.expiryDate ?? "",
    dueDate: fields.dueDate ?? "",
    referenceMasked: fields.referenceMasked ?? "",
  };
}

function fromDraft(draft: Draft, keys: FieldKey[]): DocFields {
  const out: DocFields = {};
  for (const key of keys) {
    const v = draft[key].trim();
    if (key === "referenceMasked") continue; // never edited here: only the masked form exists
    if (key === "amount") out.amount = v ? Number(v.replace(/[,₹\s]/g, "")) : undefined;
    else out[key] = v || undefined;
  }
  return out;
}

function display(key: FieldKey, value: DocFields[FieldKey]): string | null {
  if (value === undefined || value === "") return null;
  if (key === "amount") return formatINR(value as number);
  if (key === "docDate" || key === "expiryDate" || key === "dueDate") return formatDate(value as string);
  return String(value);
}

export function FieldsPanel({
  doc,
  deadlines,
  activeField,
  onShowField,
}: {
  doc: DocumentDetail;
  deadlines: Deadline[];
  activeField: FieldKey | null;
  onShowField: (key: FieldKey) => void;
}) {
  const router = useRouter();
  const keys = fieldsFor(doc.docType);
  const reviewing = doc.status === "needs_review";
  const [editing, setEditing] = useState(reviewing);
  const [draft, setDraft] = useState<Draft>(() => toDraft(doc.fields));
  const [pending, startTransition] = useTransition();

  const unsure = (key: FieldKey) => (doc.confidence[key] ?? 1) < LOW_CONFIDENCE;
  const amountInvalid = draft.amount.trim() !== "" && Number.isNaN(Number(draft.amount.replace(/[,₹\s]/g, "")));

  const submit = (confirm: boolean) =>
    startTransition(async () => {
      const result = await saveFields(doc.id, fromDraft(draft, keys), confirm);
      if (!result.ok) {
        toast.error("Couldn't save. Try again.");
        return;
      }
      toast.success(reviewing ? "Details confirmed" : "Saved");
      setEditing(false);
      router.refresh();
    });

  if (Object.keys(doc.fields).length === 0 && !reviewing) {
    return (
      <section className="rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-medium">Details</h2>
        <p className="mt-1 text-muted-foreground">
          {doc.status === "processing" || doc.status === "uploaded"
            ? "Reading this document. Company, amounts and dates appear here in a few seconds."
            : doc.status === "failed"
              ? "We couldn't read details from this file."
              : "No company, amount or dates were found in this document. You can still search and ask about it."}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {reviewing && (
        <div className="rounded-xl border border-status-review/30 bg-status-review/5 p-4">
          <p className="flex items-center gap-2 font-medium">
            <CircleAlert className="size-4 text-status-review" /> Check these details
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            We read this document automatically. Fix anything that&apos;s wrong, then confirm. Fields marked{" "}
            <span className="font-medium text-amber-700 dark:text-amber-400">check</span> are the ones we&apos;re least sure about.
          </p>
        </div>
      )}

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-medium">Details</h2>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
        </div>

        {editing ? (
          <form
            className="space-y-4 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!amountInvalid) submit(reviewing);
            }}
          >
            {keys.map((key) => {
              const id = `field-${key}`;
              const isDate = key === "docDate" || key === "expiryDate" || key === "dueDate";
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={id}>{fieldLabel(key, doc.docType)}</Label>
                    <div className="flex items-center gap-2">
                      {unsure(key) && (
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">check</span>
                      )}
                      {doc.fieldBoxes[key] && (
                        <button
                          type="button"
                          onClick={() => onShowField(key)}
                          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          Show on page
                        </button>
                      )}
                    </div>
                  </div>
                  {key === "referenceMasked" ? (
                    <Input id={id} value={draft.referenceMasked || "—"} readOnly disabled className="tabular" />
                  ) : (
                    <div className="relative">
                      {key === "amount" && (
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                      )}
                      <Input
                        id={id}
                        type={isDate ? "date" : "text"}
                        inputMode={key === "amount" ? "decimal" : undefined}
                        value={draft[key]}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                        onFocus={() => doc.fieldBoxes[key] && onShowField(key)}
                        aria-invalid={key === "amount" && amountInvalid}
                        className={cn(
                          "tabular h-10",
                          key === "amount" && "pl-7",
                          unsure(key) && "border-amber-500/60 bg-amber-50/50 dark:bg-amber-400/5",
                        )}
                      />
                    </div>
                  )}
                  {key === "referenceMasked" && (
                    <p className="text-xs text-muted-foreground">Only the last digits are kept, for your safety.</p>
                  )}
                  {key === "amount" && amountInvalid && <p className="text-xs text-destructive">Enter a number, like 1980.</p>}
                </div>
              );
            })}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={pending || amountInvalid} className="flex-1 sm:flex-none">
                {pending && <Loader2 className="animate-spin" />}
                {reviewing ? "Confirm details" : "Save"}
              </Button>
              {!reviewing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDraft(toDraft(doc.fields));
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        ) : (
          <dl className="divide-y">
            {keys.map((key) => {
              const value = display(key, doc.fields[key]);
              const box = doc.fieldBoxes[key];
              return (
                <div key={key} className="flex items-center gap-3 px-4 py-3">
                  <dt className="w-28 shrink-0 text-sm text-muted-foreground">{fieldLabel(key, doc.docType)}</dt>
                  <dd className={cn("tabular min-w-0 flex-1 truncate text-sm font-medium", !value && "font-normal text-muted-foreground")}>
                    {value ?? "Not found"}
                  </dd>
                  {box && value && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("size-8 shrink-0", activeField === key && "bg-accent text-accent-foreground")}
                      onClick={() => onShowField(key)}
                      aria-label={`Show ${fieldLabel(key, doc.docType).toLowerCase()} on the page`}
                      aria-pressed={activeField === key}
                    >
                      <Crosshair />
                    </Button>
                  )}
                </div>
              );
            })}
          </dl>
        )}
      </section>

      {deadlines.length > 0 && doc.status === "ready" && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <BellRing className="size-4 text-primary" /> Reminders
          </h2>
          <ul className="space-y-2">
            {deadlines.map((d) => {
              const days = daysUntil(d.dueDate);
              return (
                <li key={d.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span>
                    {deadlineLabel(d.kind, days)} <span className="text-muted-foreground">{formatDate(d.dueDate)}</span>
                  </span>
                  <span className={cn("tabular shrink-0 text-xs", days < 0 ? "text-destructive" : days <= 31 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                    {relativeDays(days)}
                  </span>
                </li>
              );
            })}
          </ul>
          <Link href="/vault/timeline" className="mt-3 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline">
            Manage reminders
          </Link>
        </section>
      )}

      {doc.status === "ready" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Stored privately. ID numbers are masked before any AI reads them.
        </p>
      )}
    </div>
  );
}
