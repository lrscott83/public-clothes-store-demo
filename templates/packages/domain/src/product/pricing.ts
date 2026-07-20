import type { Money } from '../currency/money.js';
import { money } from '../currency/money.js';
import { divRoundHalfUp } from '../currency/rate-resolver.js';
import { InvalidMoneyError } from '../currency/errors.js';
import type { Product } from './product.js';

/** Decimal scale for `percentDiscountPrice` — mirrors `MONEY_SCALE`/`RATE_SCALE`. */
export const PERCENT_SCALE = 2;

const PERCENT_DECIMAL_PATTERN = /^(-?\d+)(?:\.(\d+))?$/;

/** Parses a decimal percent string ("12.50") into a scaled `bigint` (1250n). */
export function percentFromDecimalString(value: string): bigint {
  const match = PERCENT_DECIMAL_PATTERN.exec(value.trim());
  if (!match) {
    throw new InvalidMoneyError(`Invalid percent decimal string: "${value}"`);
  }
  const [, intPart, fracPart = ''] = match;
  if (fracPart.length > PERCENT_SCALE) {
    throw new InvalidMoneyError(
      `Percent "${value}" has more than ${PERCENT_SCALE} decimal place(s)`,
    );
  }
  const paddedFrac = fracPart.padEnd(PERCENT_SCALE, '0');
  const negative = intPart.startsWith('-');
  const absInt = negative ? intPart.slice(1) : intPart;
  const scaled = BigInt(absInt + paddedFrac || '0');
  return negative ? -scaled : scaled;
}

/** Formats a scaled `bigint` percent (1250n) back into a decimal string ("12.50"). */
export function percentToDecimalString(percent: bigint): string {
  const negative = percent < 0n;
  const abs = negative ? -percent : percent;
  const divisor = 10n ** BigInt(PERCENT_SCALE);
  const intPart = abs / divisor;
  const fracPart = (abs % divisor).toString().padStart(PERCENT_SCALE, '0');
  return `${negative ? '-' : ''}${intPart.toString()}.${fracPart}`;
}

/**
 * Derived, NEVER stored: `finalPrice = max(0, price - (percent/100 * price)
 * - discountPrice)`. Exactly ONE HALF-UP rounding — the percent discount is
 * computed as a single exact bigint division via `divRoundHalfUp`, then the
 * fixed `discountPrice` (already an exact integer) is subtracted, and the
 * result is clamped at 0. Same rounding discipline as the Currency module's
 * `convertir`.
 */
export function finalPrice(product: Product): Money {
  const discountFromPercent = divRoundHalfUp(
    product.price.minorUnits * product.percentDiscountPrice,
    10_000n,
  );
  const finalCents =
    product.price.minorUnits - discountFromPercent - product.discountPrice.minorUnits;
  return money(finalCents < 0n ? 0n : finalCents, 'USD');
}

/** `true` when either discount mechanism is active. */
export function isOffer(product: Product): boolean {
  return product.percentDiscountPrice > 0n || product.discountPrice.minorUnits > 0n;
}
