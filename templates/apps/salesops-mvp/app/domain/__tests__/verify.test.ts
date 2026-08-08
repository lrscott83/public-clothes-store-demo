import { describe, expect, it } from 'vitest';
import { buildVerifiedTotals } from '../verify';
import type { OrderItem } from '../types';

describe('buildVerifiedTotals', () => {
  it('echoes usdToMn into exchangeRateSnapshot', () => {
    const items: OrderItem[] = [{ productId: 'p-1', quantity: 1, priceUSD: 100, commissionMN: 30 }];

    const result = buildVerifiedTotals(100, 40, items);

    expect(result.exchangeRateSnapshot).toEqual({ usdToMn: 40 });
  });

  it('computes totalMN as Math.round(totalUSD * usdToMn)', () => {
    const items: OrderItem[] = [{ productId: 'p-1', quantity: 1, priceUSD: 200, commissionMN: 30 }];

    const result = buildVerifiedTotals(200, 40, items);

    expect(result.totalMN).toBe(8000);
  });

  it('rounds totalMN for a fractional result', () => {
    const items: OrderItem[] = [{ productId: 'p-1', quantity: 1, priceUSD: 99, commissionMN: 10 }];

    const result = buildVerifiedTotals(99.5, 33.33, items);

    expect(result.totalMN).toBe(Math.round(99.5 * 33.33));
  });

  it('computes commissionMN as sumOrderCommission(items) across multiple lines', () => {
    const items: OrderItem[] = [
      { productId: 'p-1', quantity: 2, priceUSD: 50, commissionMN: 10 },
      { productId: 'p-2', quantity: 1, priceUSD: 30, commissionMN: 5 },
    ];

    const result = buildVerifiedTotals(130, 40, items);

    expect(result.commissionMN).toBe(25); // (10*2) + (5*1)
  });
});
