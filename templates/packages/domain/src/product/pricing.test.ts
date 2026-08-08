import { describe, it, expect } from 'vitest';
import {
  finalPrice,
  isOffer,
  percentFromDecimalString,
  percentToDecimalString,
  discountPriceFromDecimalString,
  discountPriceToDecimalString,
} from './pricing.js';
import { createProduct } from './product.js';
import { money } from '../currency/money.js';

function buildProduct(overrides: Partial<Parameters<typeof createProduct>[0]> = {}) {
  return createProduct({
    name: 'Cafetera Express',
    description: 'Cafetera express de 15 bares con vaporizador de leche.',
    price: money(10000n, 'USD'), // $100.00
    cost: money(6000n, 'USD'),
    categoryId: 'category-uuid-1',
    image: 'https://example.com/cafetera.png',
    order: 1,
    ...overrides,
  });
}

describe('finalPrice', () => {
  it('stacks percent + fixed discount (price=100, pct=20%, discountPrice=5 -> 75)', () => {
    const product = buildProduct({
      price: money(10000n, 'USD'),
      percentDiscountPrice: 2000n, // 20.00%
      discountPrice: 500n,
    });
    expect(finalPrice(product).minorUnits).toBe(7500n);
  });

  it('a 100% discount is free (price=50, pct=100% -> 0)', () => {
    const product = buildProduct({
      price: money(5000n, 'USD'),
      percentDiscountPrice: 10_000n, // 100.00%
    });
    expect(finalPrice(product).minorUnits).toBe(0n);
  });

  it('over-discount clamps at zero, never negative (price=10, pct=50%, discountPrice=20 -> 0)', () => {
    const product = buildProduct({
      price: money(1000n, 'USD'),
      percentDiscountPrice: 5000n, // 50.00%
      discountPrice: 2000n,
    });
    expect(finalPrice(product).minorUnits).toBe(0n);
  });

  it('no discount defaults to base price', () => {
    const product = buildProduct({ price: money(3333n, 'USD') });
    const result = finalPrice(product);
    expect(result.minorUnits).toBe(3333n);
    expect(result.currency).toBe('USD');
    expect(isOffer(product)).toBe(false);
  });

  it('rounds a .5 minor-unit boundary HALF-UP, matching the single exact-rational result — a naive float computation drifts by 1 cent', () => {
    // price=$1.00 (100 cents), percentDiscountPrice=14.50% (1450n).
    // Exact bigint: discountFromPercent = divRoundHalfUp(100*1450, 10000) = 15
    // -> finalPrice = 85 cents. A naive float computation (1.00 * 0.145 = a
    // binary-imprecise 0.145) rounds to 14 cents instead of 15 — a 1-cent
    // drift this test must reject. Verified independently via bigint search.
    const product = buildProduct({
      price: money(100n, 'USD'),
      percentDiscountPrice: 1450n,
      discountPrice: 0n,
    });
    const result = finalPrice(product);
    expect(result.minorUnits).toBe(85n);
    expect(result.minorUnits).not.toBe(86n); // the float-drift (wrong) figure
  });

  it('resolves in price.currency, independent of cost.currency (price/cost may differ)', () => {
    const product = buildProduct({
      price: money(10000n, 'EUR'),
      cost: money(6000n, 'MN'),
      percentDiscountPrice: 1000n, // 10%
    });
    const result = finalPrice(product);
    expect(result.currency).toBe('EUR');
    expect(result.minorUnits).toBe(9000n);
  });
});

describe('isOffer', () => {
  it('is true when percentDiscountPrice > 0', () => {
    const product = buildProduct({ percentDiscountPrice: 1000n });
    expect(isOffer(product)).toBe(true);
  });

  it('is true when discountPrice > 0', () => {
    const product = buildProduct({ discountPrice: 100n });
    expect(isOffer(product)).toBe(true);
  });

  it('is false when both are 0 (default)', () => {
    const product = buildProduct();
    expect(isOffer(product)).toBe(false);
  });
});

describe('percentFromDecimalString / percentToDecimalString round-trip', () => {
  it('round-trips a fractional percent ("12.50" <-> 1250n)', () => {
    const scaled = percentFromDecimalString('12.50');
    expect(scaled).toBe(1250n);
    expect(percentToDecimalString(scaled)).toBe('12.50');
  });

  it('round-trips a zero percent ("0" <-> 0n)', () => {
    const scaled = percentFromDecimalString('0');
    expect(scaled).toBe(0n);
    expect(percentToDecimalString(scaled)).toBe('0.00');
  });

  it('round-trips the maximum 100% ("100" <-> 10000n)', () => {
    const scaled = percentFromDecimalString('100');
    expect(scaled).toBe(10_000n);
    expect(percentToDecimalString(scaled)).toBe('100.00');
  });

  it('pads a single decimal digit to the percent scale', () => {
    const scaled = percentFromDecimalString('5.5');
    expect(scaled).toBe(550n);
    expect(percentToDecimalString(scaled)).toBe('5.50');
  });
});

describe('discountPriceFromDecimalString / discountPriceToDecimalString round-trip', () => {
  it('round-trips a decimal-safe amount ("5.00" <-> 500n)', () => {
    const scaled = discountPriceFromDecimalString('5.00');
    expect(scaled).toBe(500n);
    expect(discountPriceToDecimalString(scaled)).toBe('5.00');
  });

  it('round-trips zero ("0" <-> 0n)', () => {
    const scaled = discountPriceFromDecimalString('0');
    expect(scaled).toBe(0n);
    expect(discountPriceToDecimalString(scaled)).toBe('0.00');
  });

  it('pads a single decimal digit to scale 2', () => {
    const scaled = discountPriceFromDecimalString('1.5');
    expect(scaled).toBe(150n);
    expect(discountPriceToDecimalString(scaled)).toBe('1.50');
  });

  it('never a float — an exact bigint, no currency attached', () => {
    const scaled = discountPriceFromDecimalString('99.99');
    expect(typeof scaled).toBe('bigint');
    expect(scaled).toBe(9999n);
  });
});
