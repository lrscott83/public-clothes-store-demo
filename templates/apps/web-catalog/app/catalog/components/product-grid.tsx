import { ProductCard } from './product-card';
import type { PublicProductDto } from '../../shared/lib/public-api.types';

export interface ProductGridProps {
  items: PublicProductDto[];
  locale: string;
  emptyMessage: string;
}

/** Purely presentational — any filtering already happened server-side (design.md §6), this just renders the page it was handed. */
export function ProductGrid({ items, locale, emptyMessage }: ProductGridProps) {
  if (items.length === 0) {
    return (
      <div data-testid="product-grid-empty" className="text-center py-12">
        <p className="text-text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-x-3 gap-y-6">
      {items.map((item) => (
        <ProductCard key={item.id} item={item} locale={locale} />
      ))}
    </div>
  );
}
