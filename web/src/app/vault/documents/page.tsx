import { Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageContainer, PageHeader } from "@/components/app/page";
import { LibraryView } from "@/components/documents/library-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { listDocuments } from "@/lib/data";
import { countByType } from "@/lib/data/search";
import { DOC_TYPES, type DocType } from "@/lib/data/types";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage({ searchParams }: PageProps<"/vault/documents">) {
  return (
    <PageContainer>
      <PageHeader
        title="Documents"
        description="Everything you've added, searchable."
        actions={
          <Button asChild className="hidden md:inline-flex">
            <Link href="?upload=1">
              <Upload /> Upload
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<LibrarySkeleton />}>
        <Library searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function Library({ searchParams }: { searchParams: PageProps<"/vault/documents">["searchParams"] }) {
  await getCurrentUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const type = typeof sp.type === "string" && (DOC_TYPES as readonly string[]).includes(sp.type) ? (sp.type as DocType) : "all";

  const all = await listDocuments();
  const docs = await listDocuments({ q, type });

  return <LibraryView docs={docs} counts={countByType(all)} total={all.length} />;
}

function LibrarySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading documents">
      <Skeleton className="h-10 w-full" />
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
