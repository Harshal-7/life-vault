"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

// Shared across images: one refresh fixes them all, and never more than once a minute,
// so a genuinely missing file can't cause a refresh loop.
let lastRefresh = 0;

/**
 * An image from a short-lived signed link. If the page was left open until the link
 * expired, the image fails to load; re-fetching the page gets fresh links.
 */
export function SignedImage(props: React.ComponentProps<typeof Image>) {
  const router = useRouter();
  return (
    // eslint-disable-next-line jsx-a11y/alt-text -- alt is passed through by every caller
    <Image
      unoptimized
      {...props}
      onError={(e) => {
        props.onError?.(e);
        if (Date.now() - lastRefresh > 60_000) {
          lastRefresh = Date.now();
          router.refresh();
        }
      }}
    />
  );
}
