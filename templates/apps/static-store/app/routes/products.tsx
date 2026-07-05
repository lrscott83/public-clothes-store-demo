import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { ProductsPageCopy, StoreConfig } from '@store-mgmt/storefront/config';
import type { CatalogProvider } from '@store-mgmt/storefront/catalog';
import { ProductGrid } from '../components/product-grid';
import { activeConfig, catalog } from '../store/active';
import {
  DEFAULT_PER_PAGE,
  DEFAULT_SORT,
  PER_PAGE_OPTIONS,
  pageCount,
  paginate,
  paginationRange,
  searchProducts,
  sortProducts,
  type SortKey,
} from '../store/product-filters';
import type { Route } from './+types/products';

export function meta(_args: Route.MetaArgs) {
  return [{ title: `Productos - ${activeConfig.brand.name}` }];
}

const ALL_CATEGORY = '';

// English defaults; a vertical localizes any subset via `config.productsPage`.
const DEFAULT_COPY: Required<ProductsPageCopy> = {
  searchPlaceholder: 'Search products…',
  categoryLabel: 'Category',
  allCategories: 'All categories',
  sortLabel: 'Sort by',
  sortFeatured: 'Featured',
  sortPriceAsc: 'Price: low to high',
  sortPriceDesc: 'Price: high to low',
  sortNameAsc: 'Name: A to Z',
  perPageLabel: 'Show',
  perPageOptionSuffix: 'per page',
  resultsSingular: 'product',
  resultsPlural: 'products',
  emptyMessage: 'No products match your filters.',
  previousPage: 'Previous',
  nextPage: 'Next',
};

export interface ProductsPageProps {
  config: StoreConfig;
  catalog: CatalogProvider;
}

/**
 * Config-driven catalog page. Owns all filter state — category, search, sort
 * and pagination — and hands the already-filtered, already-paged product list
 * to the purely presentational `ProductGrid`. The filter/sort/paginate math
 * lives in `product-filters.ts`; the toolbar copy is localized via
 * `config.productsPage`.
 */
export function ProductsPage({ config, catalog }: ProductsPageProps) {
  const copy = { ...DEFAULT_COPY, ...config.productsPage };
  const categories = catalog.getCategories();

  const [category, setCategory] = useState(ALL_CATEGORY);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [perPage, setPerPage] = useState<number>(DEFAULT_PER_PAGE);
  const [page, setPage] = useState(1);

  // Any filter change collapses back to the first page so a shopper never lands
  // on an out-of-range page (e.g. page 4 of a now-1-page result set).
  function resetTo<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const filtered = useMemo(() => {
    const base =
      category === ALL_CATEGORY
        ? catalog.getProducts()
        : catalog.getProductsByCategory(category);
    return sortProducts(searchProducts(base, query), sort);
  }, [catalog, category, query, sort]);

  const totalPages = pageCount(filtered.length, perPage);
  const currentPage = Math.min(page, totalPages);
  const visible = paginate(filtered, currentPage, perPage);

  const resultsNoun = filtered.length === 1 ? copy.resultsSingular : copy.resultsPlural;

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'featured', label: copy.sortFeatured },
    { value: 'price-asc', label: copy.sortPriceAsc },
    { value: 'price-desc', label: copy.sortPriceDesc },
    { value: 'name-asc', label: copy.sortNameAsc },
  ];

  return (
    <main className="pt-16 min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="bg-surface rounded-lg shadow-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            {/* Search carries its own label via the placeholder, so it uses an
                aria-label instead of a redundant visible caption. */}
            <div className="relative lg:flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="product-search"
                type="search"
                value={query}
                onChange={(event) => resetTo(setQuery)(event.target.value)}
                placeholder={copy.searchPlaceholder}
                aria-label={copy.searchPlaceholder}
                className="w-full rounded-md border border-border bg-surface pl-9 pr-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <Field label={copy.categoryLabel} htmlFor="product-category">
              <Select
                id="product-category"
                value={category}
                onChange={(event) => resetTo(setCategory)(event.target.value)}
              >
                <option value={ALL_CATEGORY}>{copy.allCategories}</option>
                {categories.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={copy.sortLabel} htmlFor="product-sort">
              <Select
                id="product-sort"
                value={sort}
                onChange={(event) => resetTo(setSort)(event.target.value as SortKey)}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={copy.perPageLabel} htmlFor="product-per-page">
              <Select
                id="product-per-page"
                value={String(perPage)}
                onChange={(event) => resetTo(setPerPage)(Number(event.target.value))}
              >
                {PER_PAGE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} {copy.perPageOptionSuffix}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        <p className="mt-6 mb-4 text-sm text-text-muted" role="status" aria-live="polite">
          <span className="font-semibold text-text">{filtered.length}</span> {resultsNoun}
        </p>

        <ProductGrid
          products={visible}
          locale={config.locale}
          currency={config.currency}
          emptyMessage={copy.emptyMessage}
        />

        {filtered.length > 0 && (
          <Pagination
            current={currentPage}
            total={totalPages}
            onChange={setPage}
            previousLabel={copy.previousPage}
            nextLabel={copy.nextPage}
          />
        )}
      </div>
    </main>
  );
}

/** A labeled control column: an uppercase caption above its input/select. */
function Field({
  label,
  htmlFor,
  className = '',
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 lg:min-w-[12rem]"
    >
      {children}
    </select>
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
  // A single page needs no navigation, so the prev/next arrows are dropped.
  const showArrows = total > 1;

  return (
    <nav
      className="mt-10 flex items-center justify-center gap-1.5"
      aria-label="Pagination"
    >
      {showArrows && (
        <PagerButton
          onClick={() => onChange(current - 1)}
          disabled={current === 1}
          ariaLabel={previousLabel}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </PagerButton>
      )}

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
              isActive
                ? 'bg-primary text-surface'
                : 'text-text hover:bg-primary-light hover:text-primary'
            }`}
          >
            {item}
          </button>
        );
      })}

      {showArrows && (
        <PagerButton
          onClick={() => onChange(current + 1)}
          disabled={current === total}
          ariaLabel={nextLabel}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </PagerButton>
      )}
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

export default function ProductsRoute() {
  return <ProductsPage config={activeConfig} catalog={catalog} />;
}
