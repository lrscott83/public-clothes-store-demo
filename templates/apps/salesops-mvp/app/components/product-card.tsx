import { formatMoney } from '@store-mgmt/storefront/config';
import type { StoreProduct } from '@store-mgmt/storefront/catalog';

export interface ProductCardProps {
  product: StoreProduct;
  locale: string;
  currency: string;
}

/**
 * Copy-adapted from templates/apps/static-store/app/components/product-card.tsx
 * (no shared `ProductCard` export exists — see design.md). Price is formatted
 * via `formatMoney` (`Intl.NumberFormat`), never `"$" + toFixed(2)`.
 */
export function ProductCard({ product, locale, currency }: ProductCardProps) {
  return (
    <div className="group relative rounded-lg shadow-card overflow-hidden bg-surface transition-transform duration-300 hover:scale-[1.02]">
      <div className="w-full overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <div className="p-4">
        <h3 className="text-lg font-semibold text-text">{product.name}</h3>
        <p className="mt-1 text-sm text-text-muted">{product.description}</p>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-lg font-bold text-accent">
            {formatMoney(product.price, { locale, currency })}
          </span>
        </div>
      </div>
    </div>
  );
}
