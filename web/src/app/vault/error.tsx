"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { EmptyState, PageContainer } from "@/components/app/page";
import { Button } from "@/components/ui/button";

export default function VaultError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    typeof error === "object" && error && "digest" in error ? String((error as { digest: unknown }).digest) : null;

  return (
    <PageContainer>
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description={
          digest
            ? `This page couldn't load. If it keeps happening, mention code ${digest}.`
            : "This page couldn't load. Your documents are safe."
        }
        action={<Button onClick={() => retry()}>Try again</Button>}
      />
    </PageContainer>
  );
}
