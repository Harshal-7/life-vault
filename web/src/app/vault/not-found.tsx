import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { EmptyState, PageContainer } from "@/components/app/page";
import { Button } from "@/components/ui/button";

/** Shown inside the app frame, e.g. for a document that was deleted. */
export default function VaultNotFound() {
  return (
    <PageContainer>
      <EmptyState
        icon={FileQuestion}
        title="Not found"
        description="This document doesn't exist, or it was deleted."
        action={
          <Button asChild>
            <Link href="/vault/documents">Back to documents</Link>
          </Button>
        }
      />
    </PageContainer>
  );
}
