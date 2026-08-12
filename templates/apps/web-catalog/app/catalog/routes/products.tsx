import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { ProductGrid } from '../components/product-grid';
import {
  PAGE_SIZE_OPTIONS,
  SORT_OPTIONS,
  buildFilterSearchParams,
  pageCount,
  paginationRange,
  parseProductFilters,
  type ProductFilterPatch,
} from '../lib/product-query';
import { fetchPublicCategories, fetchPublicProducts } from '../../shared/lib/public-api.server';
import { resolveStoreConfig } from '../../shared/lib/store-config.server';
import type { StoreConfig } from '../../shared/config/stores/types';
import type { PublicCategoryDto, PublicProductListResponseDto } from '../../shared/lib/public-api.types';
import type { ReactNode } from 'react';
import type { Route } from './+types/products';

export function meta() {
  return [{ title: 'Productos' }];
}

/**
 * ALL filtering is server-side (design.md §6) — the loader forwards
 * `url.searchParams` verbatim to `api-public`'s `GET /public/products`
 * (mirrors 4.2/4.4's Host-forwarding discipline), so sharing this URL
 * reproduces the exact filtered view and the back button works: the browser
 * URL IS the filter state, never a client-only `useState`.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const config = resolveStoreConfig(request);
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? '';

  const [result, categories] = await Promise.all([
    fetchPublicProducts(url.searchParams, host),
    fetchPublicCategories(host),
  ]);

  return { config, result, categories };
}

export interface ProductsPageProps {
  config: StoreConfig;
  result: PublicProductListResponseDto;
  categories: PublicCategoryDto[];
}

const DEFAULT_COPY = {
  searchPlaceholder: 'Buscar productos…',
  categoryLabel: 'Categoría',
  allCategories: 'Todas las categorías',
  sortLabel: 'Ordenar por',
  perPageLabel: 'Mostrar',
  perPageOptionSuffix: 'por página',
  resultsSingular: 'producto',
  resultsPlural: 'productos',
  emptyMessage: 'No hay productos que coincidan con tu búsqueda.',
  previousPage: 'Anterior',
  nextPage: 'Siguiente',
};

const SELECT_CLASS =
  'w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 lg:min-w-[12rem]';

/**
 * Design copied from `static-store/app/routes/products.tsx` (read-only
 * reference, never imported) — code rewritten. Unlike the reference, filter
 * state lives in the URL (`useSearchParams`), never `useState`: every
 * control change calls `setSearchParams` with a value built by
 * `buildFilterSearchParams`, which is what makes the URL shareable and the
 * back button work (design.md §6).
 */
export function ProductsPage({ config, result, categories }: ProductsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseProductFilters(searchParams);
  const copy = { ...DEFAULT_COPY, ...config.productsPage };

  function applyPatch(patch: ProductFilterPatch) {
    setSearchParams(buildFilterSearchParams(searchParams, patch));
  }

  const resultsNoun = result.total === 1 ? copy.resultsSingular : copy.resultsPlural;
  const totalPages = pageCount(result.total, result.pageSize);

  return (
    <main className="pt-16 min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="bg-surface rounded-lg shadow-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="relative lg:flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                defaultValue={filters.q}
                onChange={(event) => applyPatch({ q: event.target.value })}
                placeholder={copy.searchPlaceholder}
                aria-label={copy.searchPlaceholder}
                className="w-full rounded-md border border-border bg-surface pl-9 pr-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <Field label={copy.categoryLabel} htmlFor="product-category">
              <select
                id="product-category"
                value={filters.categoria}
                onChange={(event) => applyPatch({ categoria: event.target.value })}
                className={SELECT_CLASS}
              >
                <option value="">{copy.allCategories}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={copy.sortLabel} htmlFor="product-sort">
              <select
                id="product-sort"
                value={filters.orden}
                onChange={(event) => applyPatch({ orden: event.target.value })}
                className={SELECT_CLASS}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={copy.perPageLabel} htmlFor="product-per-page">
              <select
                id="product-per-page"
                value={String(filters.porPagina)}
                onChange={(event) => applyPatch({ porPagina: Number(event.target.value) })}
                className={SELECT_CLASS}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} {copy.perPageOptionSuffix}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <p className="mt-6 mb-4 text-sm text-text-muted" role="status" aria-live="polite">
          <span className="font-semibold text-text">{result.total}</span> {resultsNoun}
        </p>

        <ProductGrid items={result.items} locale={config.locale} emptyMessage={copy.emptyMessage} />

        {result.items.length > 0 && totalPages > 1 && (
          <Pagination
            current={result.page}
            total={totalPages}
            onChange={(page) => applyPatch({ pagina: page })}
            previousLabel={copy.previousPage}
            nextLabel={copy.nextPage}
          />
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

function Pagination({
  current,
  total,
  onChange,
  previousLabel,
  nextLabel,
}: {
  current: number;
  total: number;
  onChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
}) {
  const items = paginationRange(current, total);

  return (
    <nav className="mt-10 flex items-center justify-center gap-1.5" aria-label="Pagination">
      <PagerButton onClick={() => onChange(current - 1)} disabled={current === 1} ariaLabel={previousLabel}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </PagerButton>

      {items.map((item, index) => {
        if (item === 'ellipsis') {
          return (
            <span
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="inline-flex h-10 min-w-[2.5rem] items-center justify-center text-sm text-text-muted"
            >
              …
            </span>
          );
        }

        const isActive = item === current;
        return (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            aria-current={isActive ? 'page' : undefined}
            className={`h-10 min-w-[2.5rem] rounded-md px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
              isActive ? 'bg-primary text-surface' : 'text-text hover:bg-primary-light hover:text-primary'
            }`}
          >
            {item}
          </button>
        );
      })}

      <PagerButton onClick={() => onChange(current + 1)} disabled={current === total} ariaLabel={nextLabel}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </PagerButton>
    </nav>
  );
}

function PagerButton({
  onClick,
  disabled,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-text transition-colors hover:bg-primary-light hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text"
    >
      {children}
    </button>
  );
}

export default function ProductsRoute({ loaderData }: Route.ComponentProps) {
  return <ProductsPage config={loaderData.config} result={loaderData.result} categories={loaderData.categories} />;
}
