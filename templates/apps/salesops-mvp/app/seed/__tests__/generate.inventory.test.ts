import { describe, expect, it } from 'vitest';
import { generateSeedState } from '../generate';

describe('generateSeedState — inventory coverage', () => {
  it('has exactly 297 entries (99 products x 3 warehouses)', () => {
    const state = generateSeedState();
    expect(state.inventory).toHaveLength(297);
  });

  it('has one entry per unique (productId, warehouseId) pair, all quantity >= 0', () => {
    const state = generateSeedState();
    const seen = new Set<string>();

    for (const entry of state.inventory) {
      const key = `${entry.productId}:${entry.warehouseId}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(entry.quantity).toBeGreaterThanOrEqual(0);
    }

    expect(seen.size).toBe(297);
  });
});
