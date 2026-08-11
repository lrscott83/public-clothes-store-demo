/**
 * Pure `/productos` URL-state helpers (design.md §3, §6: "all filtering is
 * server-side... filter state in the URL"). Kept UI-free so the route
 * component owns rendering while this stays unit-testable in isolation —
 * mirrors this repo's existing convention (`parse-public-product-query.ts`,
 * `host-slug.ts`) of separating pure logic from its caller.
 */

export const SORT_OPTIONS = [
  { value: 'destacado', label: 'Destacados' },
  { value: 'precio-asc', label: 'Precio: menor a mayor' },
  { value: 'precio-desc', label: 'Precio: mayor a menor' },
  { value: 'nombre', label: 'Nombre: A a Z' },
] as const;

export type ProductSort = (typeof SORT_OPTIONS)[number]['value'];
export const DEFAULT_SORT: ProductSort = 'destacado';

export const PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
export type ProductPageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: ProductPageSize = 12;

const ALL_CATEGORY = '';

export interface ProductFilters {
  readonly q: string;
  readonly categoria: string;
  readonly orden: ProductSort;
  readonly pagina: number;
  readonly porPagina: ProductPageSize;
}

function isValidSort(value: string | null): value is ProductSort {
  return SORT_OPTIONS.some((option) => option.value === value);
}

function isValidPageSize(value: number): value is ProductPageSize {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(value);
}

/**
 * Reads the current `/productos` filter state off a `URLSearchParams` —
 * mirrors `api-public`'s own `parse-public-product-query.ts` defaults, so
 * the UI and the API never disagree about what "absent" means. Unlike the
 * API's own parser, this NEVER rejects (no 400s in a UI reducer) — an
 * invalid/unknown value silently falls back to the same default the API
 * would apply anyway.
 */
export function parseProductFilters(searchParams: URLSearchParams): ProductFilters {
  const ordenRaw = searchParams.get('orden');
  const porPaginaRaw = Number(searchParams.get('porPagina'));
  const paginaRaw = Number(searchParams.get('pagina'));

  return {
    q: searchParams.get('q') ?? '',
    categoria: searchParams.get('categoria') ?? ALL_CATEGORY,
    orden: isValidSort(ordenRaw) ? ordenRaw : DEFAULT_SORT,
    pagina: Number.isInteger(paginaRaw) && paginaRaw >= 1 ? paginaRaw : 1,
    porPagina: isValidPageSize(porPaginaRaw) ? porPaginaRaw : DEFAULT_PAGE_SIZE,
  };
}

export type ProductFilterPatch = Partial<{
  q: string;
  categoria: string;
  orden: string;
  porPagina: number;
  pagina: number;
}>;

/**
 * Builds the next `/productos` `URLSearchParams` from the current ones plus
 * a patch. Any key in `patch` OTHER than `pagina` resets `pagina` back to 1
 * (mirrors static-store's `resetTo` — read-only design reference, new code)
 * so a filter change never stands the shopper on a now out-of-range page. A
 * value equal to its own default (or empty) is DELETED rather than written,
 * so the shareable URL stays minimal (`/productos` instead of
 * `/productos?orden=destacado&porPagina=12`).
 */
export function buildFilterSearchParams(
  current: URLSearchParams,
  patch: ProductFilterPatch,
): URLSearchParams {
  const next = new URLSearchParams(current);
  const resetsPage = Object.keys(patch).some((key) => key !== 'pagina');

  for (const [key, value] of Object.entries(patch)) {
    const isDefault =
      value === undefined ||
      value === '' ||
      (key === 'orden' && value === DEFAULT_SORT) ||
      (key === 'porPagina' && value === DEFAULT_PAGE_SIZE) ||
      (key === 'pagina' && value === 1);

    if (isDefault) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  }

  if (resetsPage) {
    next.delete('pagina');
  }

  return next;
}

/** Total number of pages for `total` items at `pageSize` (never below 1). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type PaginationEllipsis = 'ellipsis';
export type PaginationItem = number | PaginationEllipsis;

/**
 * Rewritten from `static-store/app/store/product-filters.ts`'s
 * `paginationRange` (read-only design reference, never imported) — same
 * algorithm, new code (design.md D9). Keeps five numbers visible once there
 * are more than five pages, first/last anchored, `'ellipsis'` filling any
 * gap.
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
