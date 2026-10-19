"use client";

import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8" aria-label="Life Vault home">
        <Logo />
      </Link>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <Suspense fallback={<div className="h-64" />}>
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

  async function sendLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the link. Try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
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
        <Button variant="ghost" size="sm" onClick={() => setStatus("idle")}>
          <ArrowLeft /> Use a different email
        </Button>
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

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <Button variant="outline" className="h-10 w-full" disabled>
        <GoogleMark /> Continue with Google <span className="text-xs text-muted-foreground">(soon)</span>
      </Button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.83z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}
