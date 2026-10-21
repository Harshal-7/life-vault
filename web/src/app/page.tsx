import { BellRing, Camera, FileSearch, FileText, LockKeyhole, Mic, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { PRIVACY } from "@/lib/privacy-copy";

const FEATURES: { icon: typeof Camera; title: string; body: string; soon?: boolean }[] = [
  {
    icon: Camera,
    title: "Add it in seconds",
    body: "Snap a receipt or drop a PDF. We read it, pull out the dates and amounts, and file it for you.",
  },
  {
    icon: FileSearch,
    title: "Ask, don't search",
    body: "“When does my fridge warranty end?” The answer comes back with the page it came from, highlighted.",
  },
  {
    icon: BellRing,
    title: "Never miss a date",
    body: "Warranties, policy renewals, rent agreements and bills get reminders before they're due.",
    soon: true,
  },
  {
    icon: Mic,
    title: "Just say it",
    body: "Tap the mic and ask out loud, standing at the service counter or on the phone with an insurer.",
    soon: true,
  },
];

export default function Landing() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-8">
        <Logo className="whitespace-nowrap" />
        <nav className="flex items-center gap-2">
          {/* The hero has the same two links; on small phones the header keeps only one. */}
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/vault">Get started</Link>
          </Button>
        </nav>
      </header>

      {/* clip, not hidden: the preview's glow bleeds past the edge on phones, and clip
          doesn't create a scroll container. */}
      <main className="flex-1 overflow-x-clip">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-10 pb-16 md:grid-cols-[1.1fr_1fr] md:px-8 md:pt-20 md:pb-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" /> {PRIVACY.badge}
            </p>
            <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight md:text-6xl">
              Ask your paperwork <span className="text-primary">anything.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Bills, receipts, warranties, insurance and rent agreements in one place. Ask a question and get the answer, with
              the exact line it came from.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 px-5 text-base">
                <Link href="/vault">Get started</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5 text-base">
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
          </div>

          <AnswerPreview />
        </section>

        <section id="how-it-works" className="scroll-mt-4 border-t bg-muted/40">
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-16 sm:grid-cols-2 md:px-8 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border bg-card p-5">
                <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <f.icon className="size-5" />
                </span>
                <h2 className="flex items-center gap-2 font-medium">
                  {f.title}
                  {f.soon && (
                    <span className="rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">Soon</span>
                  )}
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8">
          <div className="grid gap-6 rounded-2xl border bg-card p-6 md:grid-cols-3 md:p-8">
            <div className="md:col-span-1">
              <h2 className="text-xl font-semibold tracking-tight">Your documents stay yours</h2>
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground md:col-span-2">
              <li className="flex gap-3">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /> {PRIVACY.storage}
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> {PRIVACY.masking}
              </li>
              <li className="flex gap-3">
                <FileText className="mt-0.5 size-4 shrink-0 text-primary" /> {PRIVACY.original}
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground md:px-8">
          <span>Life Vault</span>
          <span>Answers come only from your own documents.</span>
        </div>
      </footer>
    </div>
  );
}

/** A static picture of an answer, so visitors see what the app does before signing in. */
function AnswerPreview() {
  return (
    <div aria-hidden className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-accent via-transparent to-transparent opacity-80 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-black/5">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3 text-sm font-medium">
          <span className="text-muted-foreground">Q</span> When does my fridge warranty end?
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-xl bg-accent/60 px-4 py-3">
            <p className="text-xs font-medium tracking-wide text-accent-foreground/80 uppercase">Warranty ends</p>
            <p className="tabular text-3xl font-semibold tracking-tight text-accent-foreground">14 Mar 2027</p>
            <p className="text-sm text-accent-foreground/80">in 5 months</p>
          </div>
          <p className="text-sm leading-relaxed">
            Your Coolwave fridge is covered until 14 Mar 2027. The compressor and cooling parts are included; glass shelves
            aren&apos;t.
          </p>
          <div className="flex gap-3 rounded-xl border p-2">
            <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md border bg-white">
              <div className="h-3 bg-[#0e7490]" />
              <div className="space-y-1 p-1">
                {[70, 90, 60, 80].map((w, i) => (
                  <div key={i} className="h-0.5 rounded bg-stone-300" style={{ width: `${w}%` }} />
                ))}
                <div className="h-1.5 w-3/5 rounded-sm bg-amber-300/80" />
              </div>
            </div>
            <div className="min-w-0 py-0.5">
              <p className="truncate text-sm font-medium">Coolwave fridge warranty</p>
              <p className="text-xs text-muted-foreground">Warranty valid until 14 Mar 2027</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Page 1</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
