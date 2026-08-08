/**
 * Favicon for the Sales Ops Cockpit, matching the `appliances` storefront:
 * the Lucide "Store" glyph stroked with that vertical's brand primary
 * (`rgb(37 99 235)`). Inlined as an SVG `data:` URI so it needs no runtime
 * React render and no `/favicon.ico` network request (which has no route here
 * and would just 404).
 *
 * The icon markup and color are copied verbatim from the appliances vertical so
 * the two apps share one favicon; keep them in sync if that brand changes.
 */

// Inner markup of Lucide's `Store` icon (pinned in the lockfile), copied so the
// favicon needs no `lucide-react` render.
const STORE_ICON_PATHS =
  '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>' +
  '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>' +
  '<path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>' +
  '<path d="M2 7h20"/>' +
  '<path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/>';

// The appliances vertical's brand primary color.
const APPLIANCES_PRIMARY = 'rgb(37 99 235)';

/** Builds an inline SVG favicon (as a `data:` URI) stroked with `color`. */
export function buildFaviconDataUri(inner: string, color: string): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
    `stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${inner}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** The appliances-matching favicon used for every route in this app. */
export const faviconHref = buildFaviconDataUri(STORE_ICON_PATHS, APPLIANCES_PRIMARY);
