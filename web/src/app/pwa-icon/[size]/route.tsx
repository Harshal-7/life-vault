import { ImageResponse } from "next/og";

import { BrandTile } from "@/lib/brand/icon";

const SIZES = [192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((s) => ({ size: String(s) }));
}

/** PNG icons for the web app manifest (Android install, splash screen). */
export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size: raw } = await ctx.params;
  const size = Number(raw);
  if (!SIZES.includes(size as (typeof SIZES)[number])) return new Response("Not found", { status: 404 });
  // Square, with extra padding, so it also works as a "maskable" icon.
  return new ImageResponse(<BrandTile size={size} radius={0} padding={0.24} />, { width: size, height: size });
}
