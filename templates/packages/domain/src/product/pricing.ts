import type { Money } from '../currency/money.js';
import { money } from '../currency/money.js';
import { divRoundHalfUp } from '../currency/rate-resolver.js';
import { InvalidMoneyError } from '../currency/errors.js';
import type { Product } from './product.js';

/** Decimal scale for `percentDiscountPrice` — mirrors `MONEY_SCALE`/`RATE_SCALE`. */
export const PERCENT_SCALE = 2;

/**
 * Decimal scale for `discountPrice` — a bare decimal-safe amount (NOT
 * `Money`, no currency attached), matching `MONEY_SCALE` (all supported
 * currencies are scale 2 today).
 */
export const DISCOUNT_PRICE_SCALE = 2;

const SCALED_DECIMAL_PATTERN = /^(-?\d+)(?:\.(\d+))?$/;

/**
 * Shared decimal-string <-> scaled-`bigint` parser, reused by both
 * `percentFromDecimalString` and `discountPriceFromDecimalString` — same
 * no-float discipline as `Money`'s `parseDecimalToMinorUnits`.
 */
function scaledDecimalFromString(value: string, scale: number, label: string): bigint {
  const match = SCALED_DECIMAL_PATTERN.exec(value.trim());
  if (!match) {
    throw new InvalidMoneyError(`Invalid ${label} decimal string: "${value}"`);
  }
  const [, intPart, fracPart = ''] = match;
  if (fracPart.length > scale) {
    throw new InvalidMoneyError(`${label} "${value}" has more than ${scale} decimal place(s)`);
  }
  const paddedFrac = fracPart.padEnd(scale, '0');
  const negative = intPart.startsWith('-');
  const absInt = negative ? intPart.slice(1) : intPart;
  const scaled = BigInt(absInt + paddedFrac || '0');
  return negative ? -scaled : scaled;
}

/** Shared scaled-`bigint` -> decimal-string formatter, reused as above. */
function scaledDecimalToString(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const divisor = 10n ** BigInt(scale);
  const intPart = abs / divisor;
  const fracPart = (abs % divisor).toString().padStart(scale, '0');
  return `${negative ? '-' : ''}${intPart.toString()}.${fracPart}`;
}

/** Parses a decimal percent string ("12.50") into a scaled `bigint` (1250n). */
export function percentFromDecimalString(value: string): bigint {
  return scaledDecimalFromString(value, PERCENT_SCALE, 'percent');
}

/** Formats a scaled `bigint` percent (1250n) back into a decimal string ("12.50"). */
export function percentToDecimalString(percent: bigint): string {
  return scaledDecimalToString(percent, PERCENT_SCALE);
}

/**
 * Parses a decimal `discountPrice` string ("5.00") into a scaled `bigint`
 * (500n) — decimal-safe, no currency (reuses the same scaled-decimal
 * discipline as `percentFromDecimalString`).
 */
export function discountPriceFromDecimalString(value: string): bigint {
  return scaledDecimalFromString(value, DISCOUNT_PRICE_SCALE, 'discountPrice');
}

/** Formats a scaled `bigint` `discountPrice` (500n) back into a decimal string ("5.00"). */
export function discountPriceToDecimalString(value: bigint): string {
  return scaledDecimalToString(value, DISCOUNT_PRICE_SCALE);
}

/**
 * Derived, NEVER stored: `finalPrice = max(0, price - (percent/100 * price)
 * - discountPrice)`. `price` is `Money`; `percentDiscountPrice` and
 * `discountPrice` are bare scalars applied to `price`'s amount. `cost` is
 * NOT part of this computation. Exactly ONE HALF-UP rounding — the percent
 * discount is computed as a single exact bigint division via
 * `divRoundHalfUp`, then the fixed `discountPrice` (already an exact
 * integer) is subtracted, and the result is clamped at 0 — in
 * `price.currency`. Same rounding discipline as the Currency module's
 * `convert`.
 */
export function finalPrice(product: Product): Money {
  const discountFromPercent = divRoundHalfUp(
    product.price.minorUnits * product.percentDiscountPrice,
    10_000n,
  );
  const finalCents = product.price.minorUnits - discountFromPercent - product.discountPrice;
  return money(finalCents < 0n ? 0n : finalCents, product.price.currency);
}

/** `true` when either discount mechanism is active. */
export function isOffer(product: Product): boolean {
  return product.percentDiscountPrice > 0n || product.discountPrice > 0n;
}
