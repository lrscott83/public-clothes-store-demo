import { useState } from 'react';

export interface ProductImageProps {
  /** `null` when the row has no image — see design.md D8. */
  src: string | null;
  alt: string;
  /** Sizing classes. Applied to the image AND the placeholder, so the box never moves. */
  className: string;
}

/**
 * Blank white placeholder rendered when `src` is `null` OR when the real
 * `<img>` fires `onError` (404, CORS, DNS, etc.).  The box dimensions stay
 * identical — no layout shift, no broken-image glyph.
 */
function Placeholder({ alt, className }: { alt: string; className: string }) {
  return (
    <div
      role="group"
      aria-label={`${alt} (sin imagen)`}
      className={`flex items-center justify-center bg-white ${className}`}
    />
  );
}

/**
 * One image element for the whole app (design.md D8). The placeholder is a
 * blank white box in the SAME dimensions as the real image: no network
 * request, no 404 round-trip, no layout shift, and no broken-image glyph.
 * Used by the storefront card and detail, and by both admin lists and
 * forms, so "no image" looks deliberate everywhere instead of accidental
 * in each place.
 *
 * When `src` points to a file that doesn't exist on disk (orphan DB ref,
 * CDN misconfiguration, etc.), the `<img onError>` silently swaps to the
 * same blank placeholder so the card never shows a broken-image glyph.
 */
export function ProductImage({ src, alt, className }: ProductImageProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (src === null || imgFailed) {
    return <Placeholder alt={alt} className={className} />;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setImgFailed(true)}
    />
  );
}
