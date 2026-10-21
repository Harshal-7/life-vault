import { BellRing, Download, Mail, Palette, ShieldCheck, TriangleAlert, User } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ComingSoon } from "@/components/app/coming-soon";
import { PageContainer, PageHeader } from "@/components/app/page";
import { AllowedSenders, CopyAddress, DeleteAccount, ReminderDays, ThemePicker } from "@/components/settings/settings-forms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { signOut } from "@/app/vault/actions";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { features } from "@/lib/features";
import { PRIVACY } from "@/lib/privacy-copy";

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
            <li>{PRIVACY.storage}</li>
            <li>{PRIVACY.masking}</li>
            <li>{PRIVACY.original}</li>
          </ul>
          <Button variant="outline" disabled className="mt-4 h-auto min-h-9 whitespace-normal">
            <Download /> Download my data (soon)
          </Button>
        </Section>

        <Section icon={TriangleAlert} title="Delete account" tone="danger" description="Erase your account, all documents and reminders. This can't be undone.">
          {features().deleteAccount ? (
            <DeleteAccount demo={isDemoMode()} />
          ) : (
            <ComingSoon>Until then, you can delete documents one by one from their ⋯ menu.</ComingSoon>
          )}
        </Section>
      </div>
    </PageContainer>
  );
}

async function AccountSettings() {
  const user = await getCurrentUser();
  const settings = await getSettings();
  const demo = isDemoMode();
  const on = features();

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

      <Section icon={Mail} title="Forward documents by email" description="Send or forward bills and receipts to your own vault address and they're added for you.">
        {on.inbound ? (
          <>
            {settings.inboundAddress && <CopyAddress address={settings.inboundAddress} />}
            <div className="mt-5 space-y-2">
              <p className="text-sm font-medium">Accepted senders</p>
              <p className="text-sm text-muted-foreground">
                Only mail from these addresses is accepted, so nobody else can add files to your vault.
              </p>
              <AllowedSenders initial={settings.allowedSenders} />
            </div>
          </>
        ) : (
          <ComingSoon>You&apos;ll get a private address to forward bills to, accepted only from senders you choose.</ComingSoon>
        )}
      </Section>

      <Section icon={BellRing} title="Reminders" description="Email me this long before a warranty ends, a policy renews or a bill is due.">
        {on.reminderSettings ? (
          <ReminderDays initial={settings.reminderDays} />
        ) : (
          <ComingSoon>Email reminders before due dates. You&apos;ll choose how early here.</ComingSoon>
        )}
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
