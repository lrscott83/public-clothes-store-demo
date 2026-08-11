import { formatMoney } from '../../shared/lib/money';
import { ProductBadges } from './product-badges';
import type { PublicProductDto } from '../../shared/lib/public-api.types';

export interface ProductCardProps {
  item: PublicProductDto;
  locale: string;
}

/**
 * Design copied from `static-store/app/components/product-card.tsx` (read-
 * only reference, never imported) — code rewritten for `PublicProductDto`
 * (design.md D9/§3). Price goes through this app's own `formatMoney`
 * (`app/shared/lib/money.ts`), never `Intl.NumberFormat` directly and never
 * string concatenation, so `MN` renders instead of throwing.
 *
 * `finalPrice` always renders in the accent colour; the original `price`
 * renders struck through beside it ONLY when `isOffer` — when the product
 * isn't on offer, `finalPrice` already equals `price`, so there is nothing
 * to strike through.
 */
export function ProductCard({ item, locale }: ProductCardProps) {
  return (
    <div className="group relative rounded-lg shadow-card overflow-hidden bg-surface transition-transform duration-300 hover:scale-[1.02]">
      <ProductBadges item={item} locale={locale} />

      <div className="w-full overflow-hidden">
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <div className="p-4">
        <h3 className="text-lg font-semibold text-text">{item.name}</h3>
        <p className="mt-1 text-sm text-text-muted">{item.description}</p>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-lg font-bold text-accent">
            {formatMoney(item.finalPrice.amount, { locale, currency: item.finalPrice.currency })}
          </span>
          {item.isOffer && (
            <span data-testid="product-card-original-price" className="text-sm line-through text-text-muted">
              {formatMoney(item.price.amount, { locale, currency: item.price.currency })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
