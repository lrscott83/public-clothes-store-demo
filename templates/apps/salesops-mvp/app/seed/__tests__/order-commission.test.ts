import { describe, expect, it } from 'vitest';
import { sumOrderCommission } from '../enrich-products';
import type { OrderItem } from '../../domain/types';

function buildItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return { productId: 'p1', quantity: 1, priceUSD: 10, commissionMN: 1000, ...overrides };
}

describe('sumOrderCommission', () => {
  it('sums item.commissionMN * item.quantity across the cart', () => {
    const items = [
      buildItem({ quantity: 1, commissionMN: 4000 }),
      buildItem({ quantity: 2, commissionMN: 1000 }),
    ];
    expect(sumOrderCommission(items)).toBe(6000); // 4000*1 + 1000*2
  });

  it('ignores combo/quantity tiers — pure linear sum, no discounting', () => {
    const bigCart = [buildItem({ quantity: 3, commissionMN: 3000 })];
    expect(sumOrderCommission(bigCart)).toBe(9000); // no tiered discount applied
  });

  it('returns 0 for an empty cart', () => {
    expect(sumOrderCommission([])).toBe(0);
  });
});
