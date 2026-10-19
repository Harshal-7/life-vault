"use client";

import { Check, Copy, Loader2, Monitor, Moon, Plus, Sun, Trash2, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSettings } from "@/lib/data/actions";
import { cn } from "@/lib/utils";

export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-1 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-sm">{address}</code>
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("Couldn't copy. Select the address and copy it manually.");
          }
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AllowedSenders({ initial }: { initial: string[] }) {
  const [senders, setSenders] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const persist = (next: string[], message: string) =>
    startTransition(async () => {
      const saved = await saveSettings({ allowedSenders: next });
      setSenders(saved.allowedSenders);
      toast.success(message);
    });

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {senders.map((s) => (
          <li key={s} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
            <span className="truncate">{s}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Remove ${s}`}
              disabled={pending || senders.length === 1}
              onClick={() => persist(senders.filter((x) => x !== s), `Removed ${s}`)}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const email = draft.trim().toLowerCase();
          if (!EMAIL.test(email)) return setError("Enter a valid email address.");
          if (senders.includes(email)) return setError("That address is already allowed.");
          setError("");
          setDraft("");
          persist([...senders, email], `Added ${email}`);
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="new-sender" className="sr-only">
            Add an address
          </Label>
          <Input
            id="new-sender"
            type="email"
            inputMode="email"
            placeholder="family@example.com"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "new-sender-error" : undefined}
            className="h-9"
          />
          {error && (
            <p id="new-sender-error" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" variant="outline" disabled={pending} className="h-9">
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add
        </Button>
      </form>
    </div>
  );
}

const DAY_OPTIONS = [60, 30, 14, 7, 3, 1];

export function ReminderDays({ initial }: { initial: number[] }) {
  const [days, setDays] = useState(initial);
  const [pending, startTransition] = useTransition();

  const toggle = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => b - a);
    if (next.length === 0) {
      toast("Keep at least one reminder", { description: "Otherwise deadlines could slip past unnoticed." });
      return;
    }
    setDays(next);
    startTransition(async () => {
      await saveSettings({ reminderDays: next });
    });
  };

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Remind me this many days before">
      {DAY_OPTIONS.map((d) => {
        const on = days.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            aria-pressed={on}
            disabled={pending}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            {on && <Check className="size-3.5" />}
            {d === 1 ? "1 day" : `${d} days`}
          </button>
        );
      })}
    </div>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  // The saved theme is only known in the browser; render neutral until then.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
      {options.map((o) => {
        const active = mounted && (theme ?? "system") === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(o.value)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition-colors",
              active ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted",
            )}
          >
            <o.icon className="size-5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function DeleteAccount({ demo }: { demo: boolean }) {
  const [typed, setTyped] = useState("");
  return (
    <AlertDialog onOpenChange={(open) => !open && setTyped("")}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 /> Delete account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account and every document?</AlertDialogTitle>
          <AlertDialogDescription>
            All files, details, reminders and question history are erased for good. Type <strong>DELETE</strong> to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" autoComplete="off" />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={typed !== "DELETE"}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() =>
              // TODO(api): DELETE /me (removes storage files, rows and the auth user).
              toast(demo ? "Demo mode: nothing was deleted" : "Account deletion isn't connected yet", {
                description: "This button will work once the backend is wired up.",
              })
            }
          >
            Delete everything
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
