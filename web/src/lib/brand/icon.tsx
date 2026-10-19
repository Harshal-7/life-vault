/** The app mark (a vault) on a teal tile, shared by the favicon, apple icon and PWA icons. */

export const BRAND_TEAL = "#11706f";
export const BRAND_BG = "#fcfbf9";

const GLYPH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="7.5" cy="7.5" r=".5" fill="white"/><path d="m7.9 7.9 2.7 2.7"/><circle cx="16.5" cy="7.5" r=".5" fill="white"/><path d="m13.4 10.6 2.7-2.7"/><circle cx="7.5" cy="16.5" r=".5" fill="white"/><path d="m7.9 16.1 2.7-2.7"/><circle cx="16.5" cy="16.5" r=".5" fill="white"/><path d="m13.4 13.4 2.7 2.7"/><circle cx="12" cy="12" r="2"/></svg>`;

const GLYPH_URI = `data:image/svg+xml;utf8,${encodeURIComponent(GLYPH)}`;

/**
 * JSX for next/og ImageResponse. `padding` leaves room for maskable icons, where
 * Android may crop to a circle.
 */
export function BrandTile({ size, radius, padding = 0.18 }: { size: number; radius: number; padding?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_TEAL,
        borderRadius: radius,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={GLYPH_URI} width={size * (1 - padding * 2)} height={size * (1 - padding * 2)} alt="" />
    </div>
  );
}
