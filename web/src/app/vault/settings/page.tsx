import { BellRing, Download, Mail, Palette, ShieldCheck, TriangleAlert, User } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageContainer, PageHeader } from "@/components/app/page";
import { AllowedSenders, CopyAddress, DeleteAccount, ReminderDays, ThemePicker } from "@/components/settings/settings-forms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { signOut } from "@/app/vault/actions";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Suspense fallback={<SettingsSkeleton />}>
          <AccountSettings />
        </Suspense>

        <Section icon={Palette} title="Appearance">
          <ThemePicker />
        </Section>

        <Section icon={ShieldCheck} title="Privacy">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Files are stored privately and only opened through short-lived links.</li>
            <li>ID numbers (Aadhaar, PAN, policy numbers) are masked before any AI reads your documents.</li>
            <li>Your documents are never used to train AI models.</li>
          </ul>
          <Button variant="outline" disabled className="mt-4">
            <Download /> Download all my data (coming soon)
          </Button>
        </Section>
      </div>
    </PageContainer>
  );
}

async function AccountSettings() {
  const user = await getCurrentUser();
  const settings = await getSettings();
  const demo = isDemoMode();

  return (
    <>
      <Section icon={User} title="Account">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{user.email}</p>
            <p className="text-sm text-muted-foreground">{demo ? "Demo mode: changes reset when the server restarts." : "Signed in with email link"}</p>
          </div>
          <form action={signOut}>
            <Button variant="outline">{demo ? "Leave demo" : "Sign out"}</Button>
          </form>
        </div>
      </Section>

      <Section icon={Mail} title="Forward documents by email" description="Send or forward bills and receipts to this address and they're added to your vault.">
        {settings.inboundAddress ? (
          <CopyAddress address={settings.inboundAddress} />
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Your forwarding address arrives with email capture (milestone M4).
          </p>
        )}
        <div className="mt-5 space-y-2">
          <p className="text-sm font-medium">Accepted senders</p>
          <p className="text-sm text-muted-foreground">
            Only mail from these addresses is accepted, so nobody else can add files to your vault.
          </p>
          <AllowedSenders initial={settings.allowedSenders} />
        </div>
      </Section>

      <Section icon={BellRing} title="Reminders" description="Email me this long before a warranty ends, a policy renews or a bill is due.">
        <ReminderDays initial={settings.reminderDays} />
      </Section>

      <Section icon={TriangleAlert} title="Delete account" tone="danger" description="Erase your account, all documents and reminders. This can't be undone.">
        <DeleteAccount demo={demo} />
      </Section>
    </>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section className={tone === "danger" ? "rounded-xl border border-destructive/30 p-5" : "rounded-xl border bg-card p-5"}>
      <h2 className="flex items-center gap-2 font-medium">
        <Icon className={tone === "danger" ? "size-4 text-destructive" : "size-4 text-primary"} /> {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-xl" />
      ))}
    </div>
  );
}
