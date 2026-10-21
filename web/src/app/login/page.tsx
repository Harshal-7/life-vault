"use client";

import { ArrowLeft, Loader2, MailCheck, RotateCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

const RESEND_AFTER_S = 30;

/** Supabase's messages are written for developers; these are for people. */
function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  if (message.includes("rate limit") || message.includes("too many") || message.includes("security purposes"))
    return "Too many sign-in emails just now. Wait a minute, then try again.";
  if (message.includes("invalid") && message.includes("email")) return "That email address doesn't look right.";
  if (err instanceof TypeError || message.includes("fetch")) return "Couldn't reach Life Vault. Check your connection.";
  return "Couldn't send the link. Try again in a minute.";
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8" aria-label="Life Vault home">
        <Logo />
      </Link>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <Suspense
          fallback={
            <div className="space-y-4" aria-busy="true">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">
        No password needed. We email you a one-time link; it works in the browser you request it from.
      </p>
    </main>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState(params.get("error") === "link" ? "That sign-in link has expired or was already used. Request a new one." : "");

  // Seconds until "Resend link" is allowed (Supabase limits how often it emails).
  const [wait, setWait] = useState(0);
  const [sentOnce, setSentOnce] = useState(false);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function sendLink(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/vault` },
      });
      if (error) throw error;
      setStatus("sent");
      setSentOnce(true);
      setWait(RESEND_AFTER_S);
    } catch (err) {
      setError(friendlyError(err));
      setStatus("error");
    }
  }

  // Stay on "Check your email" while a resend is going out.
  if (status === "sent" || (status === "sending" && sentOnce)) {
    return (
      <div className="space-y-4 text-center" role="status">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <MailCheck className="size-6" />
        </span>
        <div>
          <h1 className="text-lg font-semibold">Check your email</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We sent a sign-in link to <strong className="text-foreground">{email}</strong>. Open it on this device.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Not there? Check spam, or send it again.</p>
        <div className="flex flex-col items-center gap-1">
          <Button variant="outline" disabled={wait > 0 || status === "sending"} onClick={() => void sendLink()}>
            {status === "sending" ? <Loader2 className="animate-spin" /> : <RotateCw />}
            {wait > 0 ? `Resend link in ${wait}s` : "Resend link"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSentOnce(false);
              setStatus("idle");
            }}
          >
            <ArrowLeft /> Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">New here? The same link creates your vault.</p>
      </div>

      <form onSubmit={sendLink} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-10"
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={Boolean(error)}
          />
        </div>
        <Button type="submit" disabled={status === "sending"} className="h-10 w-full">
          {status === "sending" && <Loader2 className="animate-spin" />}
          {status === "sending" ? "Sending…" : "Email me a sign-in link"}
        </Button>
        {error && (
          <p id="login-error" className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
