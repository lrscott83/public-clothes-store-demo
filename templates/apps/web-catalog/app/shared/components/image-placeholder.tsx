export interface ProductImageProps {
  /** `null` when the row has no image — see design.md D8. */
  src: string | null;
  alt: string;
  /** Sizing classes. Applied to the image AND the placeholder, so the box never moves. */
  className: string;
}

/**
 * One image element for the whole app (design.md D8). The placeholder is an
 * inline SVG in the SAME box as the real image: no network request, no 404
 * round-trip, no layout shift, and no broken-image glyph. Used by the
 * storefront card and detail, and by both admin lists and forms, so "no image"
 * looks deliberate everywhere instead of accidental in each place.
 */
export function ProductImage({ src, alt, className }: ProductImageProps) {
  if (src !== null) {
    return <img src={src} alt={alt} className={className} />;
  }

  return (
    // `role="group"`, NOT `role="img"`: an explicit `role="img"` here would
    // give this div the SAME accessible role as a real `<img>`, so
    // `getByRole('img')` queries (used throughout this app's tests to assert
    // "no photo rendered") would match the placeholder too — that collision
    // is exactly what broke the brief's own Step 1 test against its own
    // Step 3 sample implementation. `role="group"` still gives assistive
    // tech a real accessible node (unlike the implicit "generic" role a
    // bare `<div>` would get, which browsers/screen readers are inconsistent
    // about exposing outside linear reading mode) without colliding with
    // `"img"`. `aria-label` supplies the accessible name either way.
    <div
      role="group"
      aria-label={`${alt} (sin imagen)`}
      className={`flex items-center justify-center bg-background ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
        className="h-1/3 w-1/3 text-text-muted opacity-40"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    </div>
  );
}
