import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { renderPageSvg } from "@/lib/data/mock/demo-docs";
import { findEntry } from "@/lib/data/mock/store";

/**
 * Page images for demo documents, drawn on request.
 * TODO(api): the real backend renders page images at ingestion and serves them from
 * private storage through short-lived signed URLs; this route goes away then.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/demo-pages/[id]/[page]">) {
  await getCurrentUser();
  const { id, page } = await ctx.params;
  const entry = findEntry(id);
  const index = Number(page) - 1;
  if (!entry || !Number.isInteger(index) || index < 0 || index >= entry.demo.pages.length) {
    notFound();
  }
  return new Response(renderPageSvg(entry.demo, index), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
}
