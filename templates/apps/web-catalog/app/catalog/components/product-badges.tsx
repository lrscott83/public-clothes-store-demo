import { formatMoney } from '../../shared/lib/money';
import { formatPercentBadge } from '../lib/badges';
import type { PublicProductDto } from '../../shared/lib/public-api.types';

export interface ProductBadgesProps {
  item: PublicProductDto;
  locale: string;
}

/**
 * Green "Nuevo" (isNew), red "-X%" (percentDiscountPrice > 0) and red
 * "-$X.XX" (discountPrice > 0, in the price's own currency) — ALL THREE
 * render together when they all apply. `percentDiscountPrice`/
 * `discountPrice` are two independent discount mechanisms (design.md §3
 * "Offer and Badge Data Surfaced Independently") and are never collapsed
 * into one effective percentage here.
 */
export function ProductBadges({ item, locale }: ProductBadgesProps) {
  const hasPercent = Number(item.percentDiscountPrice) > 0;
  const hasDiscount = Number(item.discountPrice) > 0;

  if (!item.isNew && !hasPercent && !hasDiscount) {
    return null;
  }

  return (
    <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-2">
      {item.isNew && (
        <span data-testid="product-badge-new" className="bg-success text-surface px-2 py-1 text-xs rounded-pill">
          Nuevo
        </span>
      )}
      {hasPercent && (
        <span
          data-testid="product-badge-percent"
          className="bg-danger text-surface px-2 py-1 text-xs rounded-pill"
        >
          {formatPercentBadge(item.percentDiscountPrice)}
        </span>
      )}
      {hasDiscount && (
        <span
          data-testid="product-badge-discount"
          className="bg-danger text-surface px-2 py-1 text-xs rounded-pill"
        >
          -{formatMoney(item.discountPrice, { locale, currency: item.price.currency })}
        </span>
      )}
    </div>
  );
}
