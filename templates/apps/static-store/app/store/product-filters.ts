import type { StoreProduct } from '@store-mgmt/storefront/catalog';

/**
 * Pure catalog filter/sort/paginate helpers for the products page. Kept UI-free
 * (no React, no config) so the route owns state + presentation while this stays
 * unit-testable in isolation — mirrors the `home-sections.ts` split.
 */

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'name-asc';

export const DEFAULT_SORT: SortKey = 'featured';

export const PER_PAGE_OPTIONS = [12, 24, 48] as const;
export const DEFAULT_PER_PAGE = 12;

/** Case-insensitive match over name + description. Blank query returns all. */
export function searchProducts(products: StoreProduct[], query: string): StoreProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  return products.filter(
    (product) =>
      product.name.toLowerCase().includes(q) ||
      product.description.toLowerCase().includes(q),
  );
}

/** Returns a NEW array; `featured` preserves the catalog's authored order. */
export function sortProducts(products: StoreProduct[], sort: SortKey): StoreProduct[] {
  const copy = [...products];
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return copy.sort((a, b) => b.price - a.price);
    case 'name-asc':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'featured':
    default:
      return copy;
  }
}

/** Total number of pages for `total` items at `perPage` (never below 1). */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** The slice of `items` on `page` (1-indexed) at `perPage` per page. */
export function paginate<T>(items: T[], page: number, perPage: number): T[] {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

/** A gap the pager renders as "…" between two non-adjacent page numbers. */
export type PaginationEllipsis = 'ellipsis';
export type PaginationItem = number | PaginationEllipsis;

/**
 * The page items to render, always keeping FIVE numbers visible once there are
 * more than five pages, with the first and last page anchored and `'ellipsis'`
 * filling any gap:
 *   - total <= 5           → every page, no ellipsis        (e.g. [1,2,3,4,5])
 *   - near the start       → [1,2,3,4,'ellipsis',last]
 *   - near the end         → [1,'ellipsis',last-3,…,last]
 *   - in the middle        → [1,'ellipsis',cur-1,cur,cur+1,'ellipsis',last]
 * A single page returns just `[1]`; the caller drops the prev/next arrows in
 * that case.
 */
export function paginationRange(current: number, total: number): PaginationItem[] {
  if (total <= 5) {
    return Array.from({ length: Math.max(1, total) }, (_, index) => index + 1);
  }
  if (current <= 3) {
    return [1, 2, 3, 4, 'ellipsis', total];
  }
  if (current >= total - 2) {
    return [1, 'ellipsis', total - 3, total - 2, total - 1, total];
  }
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}
