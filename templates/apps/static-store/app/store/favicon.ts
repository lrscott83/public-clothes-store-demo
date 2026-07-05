import { activeConfig, activeTheme } from './active';

/**
 * Inner SVG markup for each Lucide icon the storefront logo can use — the same
 * whitelist the `Header` renders (`Store`, `ShoppingBag`, `Package`). Copied
 * from `lucide-react` (pinned in the lockfile) so the favicon needs no runtime
 * React render on the server or the client.
 */
const LOGO_ICON_PATHS: Record<string, string> = {
  Store:
    '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/>',
  ShoppingBag:
    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  Package:
    '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
};

/**
 * Builds an inline SVG favicon (as a `data:` URI) for a Lucide logo icon,
 * stroked with `color`. Unknown icon names fall back to `Store` so a vertical
 * can never end up with a broken favicon.
 */
export function buildFaviconDataUri(iconName: string, color: string): string {
  const inner = LOGO_ICON_PATHS[iconName] ?? LOGO_ICON_PATHS.Store;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
    `stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${inner}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Favicon for the active vertical: its logo icon tinted with the theme's
 * resolved primary color. Follows `VITE_STORE_VERTICAL` like everything else.
 */
export const faviconHref = buildFaviconDataUri(
  activeConfig.logo.icon,
  activeTheme.colors.primary,
);
