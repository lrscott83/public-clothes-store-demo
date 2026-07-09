import { describe, expect, it } from 'vitest';
import { cartTotalUSD } from '../cart';

describe('cartTotalUSD', () => {
  it('sums priceUSD * quantity across lines', () => {
    const lines = [
      { priceUSD: 100, quantity: 2 },
      { priceUSD: 50, quantity: 1 },
    ];

    expect(cartTotalUSD(lines)).toBe(250);
  });

  it('returns 0 for an empty cart', () => {
    expect(cartTotalUSD([])).toBe(0);
  });
});
