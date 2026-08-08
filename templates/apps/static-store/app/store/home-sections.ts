import type { StoreConfig } from '@store-mgmt/storefront/config';
import type { CatalogProvider } from '@store-mgmt/storefront/catalog';

/**
 * The home page's three catalog/config-driven sections, keyed by their
 * in-page anchor id. Keeping the ids HERE — not inline in `home.tsx` and, in
 * a second place, in each vertical's `nav` config — makes the rendered
 * sections and the header nav filter share ONE source of truth. A nav anchor
 * can therefore never point at a section the page didn't render (fixes the
 * "Novedades in the menu but no New-Arrivals section" mismatch a catalog with
 * zero `isNew` products used to produce).
 */
export const HOME_SECTIONS = {
  features: 'caracteristicas',
  offers: 'ofertas',
  newArrivals: 'novedades',
} as const;

export interface HomeSectionPresence {
  features: boolean;
  offers: boolean;
  newArrivals: boolean;
}

/**
 * Which of the home page's conditional sections actually render, given the
 * active config (features) and catalog (discounted / new products). Mirrors
 * the render guards in `home.tsx` exactly.
 */
export function resolveHomeSections(
  config: StoreConfig,
  catalog: CatalogProvider,
): HomeSectionPresence {
  const products = catalog.getProducts();
  return {
    features: Boolean(config.features && config.features.length > 0),
    offers: products.some((product) => Boolean(product.discount)),
    newArrivals: products.some((product) => Boolean(product.isNew)),
  };
}

/**
 * Anchor paths (`#id`) whose target section is absent, so the header can drop
 * the matching nav entries. Anchors that don't map to a home section (e.g. a
 * hypothetical `#contacto`) are never listed here and pass through untouched.
 */
export function hiddenHomeAnchors(presence: HomeSectionPresence): string[] {
  const hidden: string[] = [];
  if (!presence.features) hidden.push(`#${HOME_SECTIONS.features}`);
  if (!presence.offers) hidden.push(`#${HOME_SECTIONS.offers}`);
  if (!presence.newArrivals) hidden.push(`#${HOME_SECTIONS.newArrivals}`);
  return hidden;
}
