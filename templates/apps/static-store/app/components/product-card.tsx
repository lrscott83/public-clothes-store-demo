import { formatMoney } from '@store-mgmt/storefront/config';
import type { StoreProduct } from '@store-mgmt/storefront/catalog';

export interface ProductCardProps {
  product: StoreProduct;
  locale: string;
  currency: string;
}

/**
 * Config-driven product card. Price is formatted via `formatMoney`
 * (`Intl.NumberFormat`), never `"$" + toFixed(2)`. New/discount badges use
 * theme-token utility classes (`bg-success`/`bg-danger`), never hardcoded
 * `bg-green-500`/`bg-red-500`.
 */
export function ProductCard({ product, locale, currency }: ProductCardProps) {
  const hasBadge = product.isNew || product.discount;

  return (
    <div className="group relative rounded-lg shadow-card overflow-hidden bg-surface transition-transform duration-300 hover:scale-[1.02]">
      {hasBadge && (
        <div className="absolute top-2 left-2 z-10 flex gap-2">
          {product.isNew && (
            <span
              data-testid="product-badge-new"
              className="bg-success text-surface px-2 py-1 text-xs rounded-pill"
            >
              New
            </span>
          )}
          {product.discount && (
            <span
              data-testid="product-badge-discount"
              className="bg-danger text-surface px-2 py-1 text-xs rounded-pill"
            >
              -{product.discount}%
            </span>
          )}
        </div>
      )}

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
          {product.originalPrice && (
            <span className="text-sm line-through text-text-muted">
              {formatMoney(product.originalPrice, { locale, currency })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
