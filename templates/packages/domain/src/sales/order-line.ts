import { randomUUID } from 'node:crypto';
import type { Currency, Money } from '../currency/money.js';
import type { ExchangeRate } from '../currency/exchange-rate.js';
import { convertBetweenCurrencies } from '../currency/rate-resolver.js';
import { finalPrice } from '../product/pricing.js';
import type { Product } from '../product/product.js';
import { InvalidOrderError } from './errors.js';

/**
 * Order-line entity — a frozen price snapshot owned by `Order`, never
 * fetched/queried on its own. `unitFinalPrice` is recomputed at build time
 * via the SAME `product/pricing.ts` `finalPrice` formula the Products
 * module uses (never a hand-rolled duplicate that could drift). `pricing.ts`
 * is off-limits to modify (additive-only constraint on Product/Currency/
 * Inventory/Customer source), so `buildOrderLine` narrows a minimal object
 * — only the three fields `finalPrice` actually reads
 * (`price`/`percentDiscountPrice`/`discountPrice`) — through a double
 * type-assertion instead of constructing a full `Product`.
 */
export interface OrderLine {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly categoryName: string;
  /** Product-native currency snapshot at build time. */
  readonly price: Money;
  readonly percentDiscountPrice: bigint;
  readonly discountPrice: bigint;
  readonly quantity: number;
  readonly unitFinalPrice: Money;
  /** `unitFinalPrice x quantity`, still in the product-native currency. */
  readonly lineTotalNative: Money;
  readonly rateApplied: ExchangeRate;
  readonly rateEffectiveFrom: Date;
  /** `lineTotalNative` converted into `Order.currency`, frozen at `verified`. */
  readonly lineTotalOrder: Money;
}

export interface BuildOrderLineInput {
  readonly productId: string;
  readonly productName: string;
  readonly categoryName: string;
  readonly price: Money;
  readonly percentDiscountPrice?: bigint;
  readonly discountPrice?: bigint;
  readonly quantity: number;
}

/**
 * Builds a frozen `OrderLine` snapshot. Throws `InvalidOrderError` when
 * `quantity` is not a positive integer. Cross-currency conversion with no
 * resolvable rate propagates `RateNotFoundError` from `convertBetweenCurrencies`
 * unchanged — this function never catches it (STOP, no partial line).
 */
export function buildOrderLine(
  input: BuildOrderLineInput,
  orderCurrency: Currency,
  rates: ExchangeRate[],
  at: Date,
): OrderLine {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new InvalidOrderError(
      `OrderLine quantity must be a positive integer, got ${input.quantity}`,
    );
  }

  const percentDiscountPrice = input.percentDiscountPrice ?? 0n;
  const discountPrice = input.discountPrice ?? 0n;

  const unitFinalPrice = finalPrice(
    { price: input.price, percentDiscountPrice, discountPrice } as unknown as Product,
  );
  const lineTotalNative: Money = {
    minorUnits: unitFinalPrice.minorUnits * BigInt(input.quantity),
    currency: unitFinalPrice.currency,
  };

  const { money: lineTotalOrder, rateApplied } = convertBetweenCurrencies(
    rates,
    lineTotalNative,
    orderCurrency,
    at,
  );

  return {
    id: randomUUID(),
    productId: input.productId,
    productName: input.productName,
    categoryName: input.categoryName,
    price: input.price,
    percentDiscountPrice,
    discountPrice,
    quantity: input.quantity,
    unitFinalPrice,
    lineTotalNative,
    rateApplied,
    rateEffectiveFrom: rateApplied.effectiveFrom,
    lineTotalOrder,
  };
}
