import type { PartialStoreTheme } from '../theme/types';
import type { CatalogData } from '../catalog/types';

export interface Brand {
  name: string;
  tagline?: string;
  copyright: string;
}

/** Whitelisted lucide icon names usable as a logo fallback when no image asset is set. */
export type LogoIcon = 'Store' | 'ShoppingBag' | 'Package';

export interface LogoConfig {
  image?: string;
  icon?: LogoIcon;
  tintToken?: string;
  alt: string;
}

export interface HeroConfig {
  image: string;
  heading: string;
  subheading: string;
  ctaLabel?: string;
  ctaPath?: string;
  overlayColor?: string;
  overlayOpacity?: number;
}

export interface NavItem {
  label: string;
  path: string;
  kind: 'route' | 'anchor';
}

export interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

/**
 * Localized copy for the home page's catalog section headings. Optional and
 * per-field: a vertical overrides only what it needs, and anything omitted
 * falls back to the English structural default in `home.tsx`. This lets a
 * Spanish vertical (NOVA, clothes) show Spanish headings that match its
 * Spanish nav labels without forcing the English `demo` vertical off its
 * defaults.
 */
export interface HomeSectionCopy {
  features?: string;
  offers?: string;
  newArrivals?: string;
}

/**
 * Localized copy for the products page's filter toolbar and pager. Optional and
 * per-field like `HomeSectionCopy`: a vertical overrides only what it needs and
 * anything omitted falls back to the English default in `products.tsx`, so the
 * Spanish verticals get Spanish controls while `demo` stays English.
 */
export interface ProductsPageCopy {
  searchPlaceholder?: string;
  categoryLabel?: string;
  allCategories?: string;
  sortLabel?: string;
  sortFeatured?: string;
  sortPriceAsc?: string;
  sortPriceDesc?: string;
  sortNameAsc?: string;
  perPageLabel?: string;
  /** Suffix appended to each page-size number, e.g. "12 per page". */
  perPageOptionSuffix?: string;
  /** Noun in the results count, e.g. "1 product" / "24 products". */
  resultsSingular?: string;
  resultsPlural?: string;
  emptyMessage?: string;
  previousPage?: string;
  nextPage?: string;
}

export interface FooterLink {
  label: string;
  path: string;
  kind: 'route' | 'anchor';
}

export interface FooterLinkGroup {
  title: string;
  links: FooterLink[];
}

export interface FooterSocialLink {
  label: string;
  url: string;
}

export interface FooterConfig {
  linkGroups?: FooterLinkGroup[];
  contact?: string;
  social?: FooterSocialLink[];
  copyright: string;
}

export interface StoreConfig {
  vertical: string;
  brand: Brand;
  locale: string;
  currency: string;
  theme: PartialStoreTheme;
  logo: LogoConfig;
  hero: HeroConfig;
  nav: NavItem[];
  features?: FeatureItem[];
  homeSections?: HomeSectionCopy;
  productsPage?: ProductsPageCopy;
  footer: FooterConfig;
  catalog: CatalogData;
}

export interface StoreVertical {
  slug: string;
  config: StoreConfig;
}
