import { randomUUID } from 'node:crypto';
import type { Money } from '../currency/money.js';
import { InvalidProductError } from './errors.js';

/**
 * Product master-data entity. `price`/`cost` reuse the Currency module's
 * `Money` VO (bigint minor units) — the currency is CHOSEN by the caller
 * (not forced to USD), and `price.currency`/`cost.currency` MAY DIFFER (buy
 * in one currency, sell in another). `discountPrice` is a bare decimal-safe
 * scaled `bigint` (no currency) — see `pricing.ts`. `finalPrice` and
 * `isOffer` are intentionally NOT fields here — they are DERIVED at read
 * time by the pure `pricing.ts` functions, never stored (avoids a
 * contradictory-state trap between a stored price and a stored discount).
 */
export interface Product {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly price: Money;
  /** Scaled bigint at PERCENT_SCALE=2 (see pricing.ts): 1250n == 12.50%. */
  readonly percentDiscountPrice: bigint;
  /** Scaled bigint at DISCOUNT_PRICE_SCALE=2 (see pricing.ts): 500n == 5.00 (no currency). */
  readonly discountPrice: bigint;
  readonly cost: Money;
  readonly categoryId: string;
  readonly image: string;
  readonly isNew: boolean;
  readonly order: number;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createProduct`. `id`/`createdAt`/`updatedAt` are optional so the
 * factory can either mint a brand-new product (defaults applied) or validate
 * an already-persisted row read back from a repository. Also the shape
 * `IProductRepository.create` accepts.
 */
export interface CreateProductInput {
  readonly id?: string;
  readonly name: string;
  readonly description: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly price: Money;
  readonly percentDiscountPrice?: bigint;
  readonly discountPrice?: bigint;
  readonly cost: Money;
  readonly categoryId: string;
  readonly image: string;
  readonly isNew?: boolean;
  readonly order: number;
  readonly active?: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/** 100.00% at PERCENT_SCALE=2 — literal here to avoid a circular import with pricing.ts. */
const PERCENT_MIN = 0n;
const PERCENT_MAX = 10_000n;

/**
 * Validates and constructs a `Product`. Enforces: `price` > 0;
 * `percentDiscountPrice` within [0, 100] (scale-2 bounds); `discountPrice`
 * >= 0; `cost` >= 0. The currency of `price`/`cost` is CALLER-CHOSEN (not
 * forced to USD) and MAY DIFFER between the two — only the `Currency` type
 * constrains valid values (USD/EUR/MN). Throws `InvalidProductError` —
 * never silently clamps or defaults an out-of-range value.
 */
export function createProduct(input: CreateProductInput): Product {
  if (input.price.minorUnits <= 0n) {
    throw new InvalidProductError('Product price must be greater than 0');
  }

  const percentDiscountPrice = input.percentDiscountPrice ?? 0n;
  if (percentDiscountPrice < PERCENT_MIN || percentDiscountPrice > PERCENT_MAX) {
    throw new InvalidProductError(
      `Product percentDiscountPrice must be between 0 and 100 (got scaled value ${percentDiscountPrice})`,
    );
  }

  const discountPrice = input.discountPrice ?? 0n;
  if (discountPrice < 0n) {
    throw new InvalidProductError('Product discountPrice must not be negative');
  }

  if (input.cost.minorUnits < 0n) {
    throw new InvalidProductError('Product cost must not be negative');
  }

  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    name: input.name,
    description: input.description,
    sku: input.sku,
    barcode: input.barcode,
    price: input.price,
    percentDiscountPrice,
    discountPrice,
    cost: input.cost,
    categoryId: input.categoryId,
    image: input.image,
    isNew: input.isNew ?? false,
    order: input.order,
    active: input.active ?? true,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
