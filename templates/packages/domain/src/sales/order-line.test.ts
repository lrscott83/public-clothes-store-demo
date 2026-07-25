import { describe, it, expect } from 'vitest';
import { buildOrderLine } from './order-line.js';
import { InvalidOrderError } from './errors.js';
import { money } from '../currency/money.js';
import { RateNotFoundError } from '../currency/errors.js';
import type { ExchangeRate } from '../currency/exchange-rate.js';

const AT = new Date('2026-07-22T00:00:00Z');

describe('buildOrderLine — pricing snapshot', () => {
  it('recomputes unitFinalPrice via the pricing.ts finalPrice formula (100, 20%, 5 -> 75)', () => {
    const line = buildOrderLine(
      {
        productId: 'product-1',
        productName: 'Cafetera Express',
        categoryName: 'Electrodomésticos',
        price: money(10000n, 'USD'),
        percentDiscountPrice: 2000n,
        discountPrice: 500n,
        quantity: 1,
      },
      'USD',
      [],
      AT,
    );
    expect(line.unitFinalPrice.minorUnits).toBe(7500n);
    expect(line.unitFinalPrice.currency).toBe('USD');
  });

  it('computes lineTotalNative = unitFinalPrice x quantity in the native currency', () => {
    const line = buildOrderLine(
      {
        productId: 'product-1',
        productName: 'Cafetera Express',
        categoryName: 'Electrodomésticos',
        price: money(10000n, 'USD'),
        percentDiscountPrice: 2000n,
        discountPrice: 500n,
        quantity: 3,
      },
      'USD',
      [],
      AT,
    );
    expect(line.lineTotalNative.minorUnits).toBe(22500n);
    expect(line.lineTotalNative.currency).toBe('USD');
  });

  it('converts lineTotalNative into the order currency via convertBetweenCurrencies, stamping the SOURCE-side rateApplied+rateEffectiveFrom', () => {
    const rates: ExchangeRate[] = [
      {
        channel: 'EUR_CASH',
        rate: 1000000n, // EUR at parity with USD (clean math)
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        id: 'rate-eur',
      },
      {
        channel: 'MN_TRANSFER',
        rate: 300000000n, // 1 USD = 300.000000 MN
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        id: 'rate-mn',
      },
    ];
    const line = buildOrderLine(
      {
        productId: 'product-1',
        productName: 'Reloj Suizo',
        categoryName: 'Accesorios',
        price: money(10000n, 'EUR'), // 100.00 EUR
        quantity: 1,
      },
      'MN',
      rates,
      AT,
    );
    // 100.00 EUR (parity w/ USD) -> 300.00/USD MN pivot -> 30000.00 MN
    expect(line.lineTotalOrder.currency).toBe('MN');
    expect(line.lineTotalOrder.minorUnits).toBe(3000000n);
    expect(line.rateApplied.id).toBe('rate-eur');
    expect(line.rateEffectiveFrom).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('same-currency with an existing rate on file stamps that resolved rate, not a blind passthrough', () => {
    const rates: ExchangeRate[] = [
      {
        channel: 'MN_CASH',
        rate: 305000000n,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        id: 'rate-mn-efectivo',
      },
    ];
    const line = buildOrderLine(
      {
        productId: 'product-1',
        productName: 'Camisa',
        categoryName: 'Ropa',
        price: money(60000n, 'MN'),
        quantity: 1,
      },
      'MN',
      rates,
      AT,
    );
    expect(line.lineTotalOrder.minorUnits).toBe(line.lineTotalNative.minorUnits);
    expect(line.rateApplied.id).toBe('rate-mn-efectivo');
  });

  it('same-currency with no rate on file uses 1x1 identity', () => {
    const line = buildOrderLine(
      {
        productId: 'product-1',
        productName: 'Cafetera Express',
        categoryName: 'Electrodomésticos',
        price: money(10000n, 'USD'),
        quantity: 1,
      },
      'USD',
      [],
      AT,
    );
    expect(line.lineTotalOrder.minorUnits).toBe(line.lineTotalNative.minorUnits);
    expect(line.rateApplied.id).toBeUndefined();
  });

  it('cross-currency with no resolvable rate propagates RateNotFoundError', () => {
    expect(() =>
      buildOrderLine(
        {
          productId: 'product-1',
          productName: 'Cafetera Express',
          categoryName: 'Electrodomésticos',
          price: money(10000n, 'USD'),
          quantity: 1,
        },
        'MN',
        [],
        AT,
      ),
    ).toThrow(RateNotFoundError);
  });

  it('rejects a zero or negative quantity with InvalidOrderError', () => {
    expect(() =>
      buildOrderLine(
        {
          productId: 'product-1',
          productName: 'Cafetera Express',
          categoryName: 'Electrodomésticos',
          price: money(10000n, 'USD'),
          quantity: 0,
        },
        'USD',
        [],
        AT,
      ),
    ).toThrow(InvalidOrderError);
  });
});
