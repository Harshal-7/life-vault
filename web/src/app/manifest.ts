import type { MetadataRoute } from "next";

import { BRAND_BG, BRAND_TEAL } from "@/lib/brand/icon";

/** Makes Life Vault installable ("Add to Home screen"). No offline service worker yet. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life Vault",
    short_name: "Life Vault",
    description: "Ask your paperwork anything.",
    start_url: "/vault",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BRAND_BG,
    theme_color: BRAND_TEAL,
    categories: ["productivity", "finance", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ask a question", url: "/vault/ask" },
      { name: "Add a document", url: "/vault/documents?upload=1" },
    ],
  };
}
