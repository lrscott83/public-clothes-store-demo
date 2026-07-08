import { describe, expect, it } from 'vitest';
import { generateSeedState } from '../generate';
import { sumOrderCommission } from '../enrich-products';

describe('generateSeedState — rate snapshot / totals', () => {
  it('gives every verificado+ order a defined rate snapshot, totalMN and commissionMN', () => {
    const state = generateSeedState();
    const verifiedOrLater = state.orders.filter((o) => o.state !== 'creado');
    expect(verifiedOrLater.length).toBeGreaterThan(0);

    for (const order of verifiedOrLater) {
      expect(order.exchangeRateSnapshot).toBeDefined();
      expect(order.totalMN).toBeDefined();
      expect(order.commissionMN).toBeDefined();
      expect(order.commissionMN).toBe(sumOrderCommission(order.items));
    }
  });

  it('leaves creado orders with no snapshot/totals/commission', () => {
    const state = generateSeedState();
    const creado = state.orders.filter((o) => o.state === 'creado');

    for (const order of creado) {
      expect(order.exchangeRateSnapshot).toBeUndefined();
      expect(order.totalMN).toBeUndefined();
      expect(order.commissionMN).toBeUndefined();
    }
  });

  it('draws every rate snapshot from the {660,670,680,690} pool', () => {
    const state = generateSeedState();
    for (const order of state.orders) {
      if (order.exchangeRateSnapshot) {
        expect([660, 670, 680, 690]).toContain(order.exchangeRateSnapshot.usdToMn);
      }
    }
  });
});
