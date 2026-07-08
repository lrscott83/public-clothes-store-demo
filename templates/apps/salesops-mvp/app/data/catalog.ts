import { createBakedCatalogProvider, type CatalogData, type CatalogProvider } from '@store-mgmt/storefront/catalog';
import catalogData from '../../public/catalog/appliances/catalog.json';

// Local copy of the appliances catalog — copied verbatim into
// public/catalog/appliances/ at scaffold time (design.md: copy-local, no
// cross-app import precedent exists in this repo). `catalog.json` stores
// image paths relative to that folder (e.g.
// "products/cafeteras/cafeteras1.jpeg"), resolved via `resolveCatalogImage`
// below, never hardcoded absolute paths.
const data = catalogData as CatalogData;

export const catalogProvider: CatalogProvider = createBakedCatalogProvider(data);

/**
 * Builds a base-path-aware URL for an image referenced by the local
 * appliances catalog. Deliberately NOT `verticalAsset` (that resolves
 * against `public/verticals/{slug}/`, static-store's multi-vertical
 * convention) — this app has its own single, local `public/catalog/appliances/`
 * prefix instead.
 */
export function resolveCatalogImage(path: string, base: string = import.meta.env.BASE_URL): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}catalog/appliances/${normalizedPath}`;
}
