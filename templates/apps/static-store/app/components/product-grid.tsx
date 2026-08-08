import type { StoreProduct } from '@store-mgmt/storefront/catalog';
import { ProductCard } from './product-card';

export interface ProductGridProps {
  products: StoreProduct[];
  locale: string;
  currency: string;
  emptyMessage?: string;
}

const DEFAULT_EMPTY_MESSAGE = 'No products found.';

/**
 * Renders a `ProductCard` per given product. Purely presentational — any
 * category/search filtering happens upstream (the caller passes in the
 * already-filtered `products` array); this keeps the grid reusable across
 * "all products" and "filtered" call sites without embedding filter UI.
 */
export function ProductGrid({ products, locale, currency, emptyMessage }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div data-testid="product-grid-empty" className="text-center py-12">
        <p className="text-text-muted">{emptyMessage ?? DEFAULT_EMPTY_MESSAGE}</p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} locale={locale} currency={currency} />
      ))}
    </div>
  );
}
