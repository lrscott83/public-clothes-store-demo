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

  it('generates a mix of payment methods, including non-USD (MN) orders', () => {
    const state = generateSeedState();
    const methods = new Set(state.orders.map((o) => o.payment.method));
    expect(methods.has('USD')).toBe(true);
    expect(methods.has('MN')).toBe(true);
  });

  it('gives every non-USD order a rate snapshot + matching totalMN, regardless of state', () => {
    const state = generateSeedState();
    const nonUSD = state.orders.filter((o) => o.payment.method !== 'USD');
    expect(nonUSD.length).toBeGreaterThan(0);

    for (const order of nonUSD) {
      expect(order.exchangeRateSnapshot).toBeDefined();
      expect(order.totalMN).toBeDefined();
      expect(order.totalMN).toBe(Math.round(order.totalUSD * order.exchangeRateSnapshot!.usdToMn));
    }
  });

  it('leaves creado USD orders with no snapshot/totals/commission', () => {
    const state = generateSeedState();
    const creadoUSD = state.orders.filter((o) => o.state === 'creado' && o.payment.method === 'USD');
    expect(creadoUSD.length).toBeGreaterThan(0);

    for (const order of creadoUSD) {
      expect(order.exchangeRateSnapshot).toBeUndefined();
      expect(order.totalMN).toBeUndefined();
      expect(order.commissionMN).toBeUndefined();
    }
  });

  it('never sets commissionMN on a creado order (commission is frozen at verification)', () => {
    const state = generateSeedState();
    const creado = state.orders.filter((o) => o.state === 'creado');
    for (const order of creado) {
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
