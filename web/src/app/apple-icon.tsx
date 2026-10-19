import { ImageResponse } from "next/og";

import { BrandTile } from "@/lib/brand/icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS rounds the corners itself, so the tile is square here.
export default function AppleIcon() {
  return new ImageResponse(<BrandTile size={180} radius={0} padding={0.2} />, size);
}
