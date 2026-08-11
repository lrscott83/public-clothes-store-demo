/**
 * `StoreConfig` REWRITTEN for `web-catalog` (design.md D9) — `packages/
 * storefront`'s `StoreConfig` (frozen) is never imported. Kept: slug, brand,
 * locale, theme.colors, logo, hero, nav, productsPage, footer. Dropped, with
 * reasons: `catalog` (the DB owns it now — the point of this change),
 * `currency` (per PRODUCT via `PublicMoneyDto`, not per store — the owner
 * explicitly refused a one-currency-per-store assumption), `vertical`/
 * `homeSections`/`features` (not in the products slice this phase ships).
 *
 * `StoreProduct.images?: string[]` from the frozen storefront type is
 * deliberately NOT reproduced anywhere in this app — dead code there, and a
 * false signal of multi-image support this app never renders (single
 * `imageUrl` per `PublicProductDto`).
 */

export interface Brand {
  readonly name: string;
  readonly tagline?: string;
  readonly copyright: string;
}

/** Whitelisted lucide icon names usable as a logo fallback when no image asset is set. */
export type LogoIcon = 'Store' | 'ShoppingBag' | 'Package';

export interface LogoConfig {
  readonly image?: string;
  readonly icon?: LogoIcon;
  readonly tintToken?: string;
  readonly alt: string;
}

export interface HeroConfig {
  /** Optional here (unlike the frozen storefront's required field) — a
   *  store with no photographed hero asset yet still renders a themed
   *  gradient background rather than a broken `<img>`. */
  readonly image?: string;
  readonly heading: string;
  readonly subheading: string;
  readonly ctaLabel?: string;
  readonly ctaPath?: string;
  readonly overlayColor?: string;
  readonly overlayOpacity?: number;
}

export interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly kind: 'route' | 'anchor';
}

/** Localized copy for the `/productos` filter toolbar and pager — every field optional, undefined falls back to the Spanish default in `catalog/routes/products.tsx`. */
export interface ProductsPageCopy {
  readonly searchPlaceholder?: string;
  readonly categoryLabel?: string;
  readonly allCategories?: string;
  readonly sortLabel?: string;
  readonly perPageLabel?: string;
  readonly perPageOptionSuffix?: string;
  readonly resultsSingular?: string;
  readonly resultsPlural?: string;
  readonly emptyMessage?: string;
  readonly previousPage?: string;
  readonly nextPage?: string;
}

export interface FooterLink {
  readonly label: string;
  readonly path: string;
  readonly kind: 'route' | 'anchor';
}

export interface FooterLinkGroup {
  readonly title: string;
  readonly links: FooterLink[];
}

export interface FooterSocialLink {
  readonly label: string;
  readonly url: string;
}

export interface FooterConfig {
  readonly linkGroups?: FooterLinkGroup[];
  readonly contact?: string;
  readonly social?: FooterSocialLink[];
  readonly copyright: string;
}

/** The subset of `web-common`'s registered `--color-*` tokens a store MAY override (theme-css-vars.ts). Every key optional — anything omitted keeps web-common's baked default. */
export interface StoreThemeColors {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
}

export interface StoreConfig {
  readonly slug: string;
  readonly brand: Brand;
  readonly locale: string;
  readonly theme: { readonly colors?: Partial<StoreThemeColors> };
  readonly logo: LogoConfig;
  readonly hero: HeroConfig;
  readonly nav: NavItem[];
  readonly productsPage?: ProductsPageCopy;
  readonly footer: FooterConfig;
}
