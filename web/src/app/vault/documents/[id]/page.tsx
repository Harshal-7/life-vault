import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageContainer } from "@/components/app/page";
import { DocumentWorkspace } from "@/components/documents/document-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { getDocument, listDeadlines } from "@/lib/data";

export default function DocumentPage({ params }: PageProps<"/vault/documents/[id]">) {
  return (
    <PageContainer className="max-w-6xl">
      <Suspense fallback={<DocumentSkeleton />}>
        <DocumentLoader params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function DocumentLoader({ params }: { params: PageProps<"/vault/documents/[id]">["params"] }) {
  await getCurrentUser();
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) notFound();
  const deadlines = (await listDeadlines()).filter((d) => d.documentId === id);

  return (
    <>
      <title>{`${doc.title} · Life Vault`}</title>
      <DocumentWorkspace doc={doc} deadlines={deadlines} />
    </>
  );
}

function DocumentSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading document">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="aspect-[3/4] max-h-[70dvh] rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
