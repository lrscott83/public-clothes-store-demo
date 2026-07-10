import { describe, expect, it } from 'vitest';
import { buildProfitabilityRanking } from '../decisiones';
import type { Order, SeedState, SeededProduct } from '../types';

function buildProduct(overrides: Partial<SeededProduct> = {}): SeededProduct {
  return {
    id: 'p-1',
    name: 'Producto 1',
    description: 'A fixture product.',
    price: 10,
    categoryId: 'cat-a',
    image: '/catalog/fixture/p1.jpg',
    commissionMN: 5,
    costUSD: 4,
    ...overrides,
  };
}

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    items: [],
    client: { id: 'c-1', name: 'Cliente 1' },
    payment: { method: 'USD' },
    warehouseId: 'wh-1',
    gestorId: 'g-1',
    state: 'verificado',
    totalUSD: 500,
    exchangeRateSnapshot: { usdToMn: 40 },
    commissionMN: 3000,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildState(overrides: Partial<SeedState> = {}): SeedState {
  return {
    version: 1,
    generatedAt: '2024-01-01T00:00:00.000Z',
    products: [],
    warehouses: [],
    gestores: [],
    transportistas: [],
    inventory: [],
    exchangeRates: { usdToMn: 40, zelle: 1, eur: 1 },
    orders: [],
    ...overrides,
  };
}

describe('buildProfitabilityRanking', () => {
  it('excludes a creado order entirely from rows, count, and totals', () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 4 })];
    const orders = [
      buildOrder({
        id: 'order-creado',
        state: 'creado',
        exchangeRateSnapshot: undefined,
        commissionMN: undefined,
        items: [{ productId: 'p-1', quantity: 2, priceUSD: 10, commissionMN: 5 }],
      }),
    ];
    const state = buildState({ products, orders });

    const view = buildProfitabilityRanking(state);

    expect(view.rows).toHaveLength(0);
    expect(view.count).toBe(0);
    expect(view.totals.revenueUSD).toBe(0);
    expect(view.totals.costUSD).toBe(0);
    expect(view.totals.commissionUSD).toBe(0);
    expect(view.totals.marginUSD).toBe(0);
  });

  it('computes commissionUSD and marginUSD from revenue, cost, and commission', () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 4 })];
    const orders = [
      buildOrder({
        id: 'order-1',
        totalUSD: 500,
        commissionMN: 3000,
        exchangeRateSnapshot: { usdToMn: 40 },
        items: [{ productId: 'p-1', quantity: 50, priceUSD: 10, commissionMN: 5 }],
      }),
    ];
    const state = buildState({ products, orders });

    const view = buildProfitabilityRanking(state);

    expect(view.rows).toHaveLength(1);
    const row = view.rows[0];
    expect(row.costUSD).toBe(200); // 50 * 4
    expect(row.commissionUSD).toBe(75); // 3000 / 40
    expect(row.marginUSD).toBe(225); // 500 - 200 - 75
  });

  it('skips an orphan item without throwing and still sums the rest of the order', () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 4 })];
    const orders = [
      buildOrder({
        id: 'order-1',
        totalUSD: 500,
        commissionMN: 3000,
        exchangeRateSnapshot: { usdToMn: 40 },
        items: [
          { productId: 'p-1', quantity: 10, priceUSD: 10, commissionMN: 5 },
          { productId: 'orphan-id', quantity: 99, priceUSD: 10, commissionMN: 5 },
        ],
      }),
    ];
    const state = buildState({ products, orders });

    expect(() => buildProfitabilityRanking(state)).not.toThrow();
    const view = buildProfitabilityRanking(state);
    const row = view.rows[0];
    expect(row.costUSD).toBe(40); // only the p-1 item: 10 * 4
  });

  it('regression: a later live-rate edit does not change an already-ranked order commission/margin', () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 4 })];
    const orders = [
      buildOrder({
        id: 'order-1',
        totalUSD: 500,
        commissionMN: 3000,
        exchangeRateSnapshot: { usdToMn: 40 },
        items: [{ productId: 'p-1', quantity: 50, priceUSD: 10, commissionMN: 5 }],
      }),
    ];
    const state = buildState({ products, orders, exchangeRates: { usdToMn: 40, zelle: 1, eur: 1 } });

    const before = buildProfitabilityRanking(state);
    expect(before.rows[0].commissionUSD).toBe(75);
    expect(before.rows[0].marginUSD).toBe(225);

    // mutate the LIVE rate — must NOT affect the already-frozen order
    state.exchangeRates.usdToMn = 45;

    const after = buildProfitabilityRanking(state);
    expect(after.rows[0].commissionUSD).toBe(75);
    expect(after.rows[0].marginUSD).toBe(225);
  });

  it('defends against divide-by-zero: missing/zero usdToMn yields commissionUSD 0, does not throw', () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 4 })];
    const orders = [
      buildOrder({
        id: 'order-zero-rate',
        totalUSD: 500,
        commissionMN: 3000,
        exchangeRateSnapshot: { usdToMn: 0 },
        items: [{ productId: 'p-1', quantity: 10, priceUSD: 10, commissionMN: 5 }],
      }),
      buildOrder({
        id: 'order-missing-rate',
        totalUSD: 500,
        commissionMN: 3000,
        exchangeRateSnapshot: undefined,
        items: [{ productId: 'p-1', quantity: 10, priceUSD: 10, commissionMN: 5 }],
      }),
    ];
    const state = buildState({ products, orders });

    expect(() => buildProfitabilityRanking(state)).not.toThrow();
    const view = buildProfitabilityRanking(state);
    for (const row of view.rows) {
      expect(row.commissionUSD).toBe(0);
    }
  });

  it('sorts rows by marginUSD descending, tie-breaking by orderId.localeCompare', () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 0 })];
    const orders = [
      buildOrder({ id: 'order-b', totalUSD: 100, commissionMN: 0, exchangeRateSnapshot: { usdToMn: 40 }, items: [] }),
      buildOrder({ id: 'order-c', totalUSD: -20, commissionMN: 0, exchangeRateSnapshot: { usdToMn: 40 }, items: [] }),
      buildOrder({ id: 'order-a', totalUSD: 300, commissionMN: 0, exchangeRateSnapshot: { usdToMn: 40 }, items: [] }),
    ];
    const state = buildState({ products, orders });

    const view = buildProfitabilityRanking(state);

    expect(view.rows.map((r) => r.orderId)).toEqual(['order-a', 'order-b', 'order-c']);
  });

  it('tie-breaks equal-margin rows by orderId.localeCompare', () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 0 })];
    const orders = [
      buildOrder({ id: 'order-z', totalUSD: 100, commissionMN: 0, exchangeRateSnapshot: { usdToMn: 40 }, items: [] }),
      buildOrder({ id: 'order-a', totalUSD: 100, commissionMN: 0, exchangeRateSnapshot: { usdToMn: 40 }, items: [] }),
    ];
    const state = buildState({ products, orders });

    const view = buildProfitabilityRanking(state);

    expect(view.rows.map((r) => r.orderId)).toEqual(['order-a', 'order-z']);
  });

  it('flags a negative-margin row as isLoss:true and zero/positive as isLoss:false', () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 0 })];
    const orders = [
      buildOrder({ id: 'order-loss', totalUSD: -20, commissionMN: 0, exchangeRateSnapshot: { usdToMn: 40 }, items: [] }),
      buildOrder({ id: 'order-zero', totalUSD: 0, commissionMN: 0, exchangeRateSnapshot: { usdToMn: 40 }, items: [] }),
      buildOrder({ id: 'order-profit', totalUSD: 100, commissionMN: 0, exchangeRateSnapshot: { usdToMn: 40 }, items: [] }),
    ];
    const state = buildState({ products, orders });

    const view = buildProfitabilityRanking(state);

    const lossRow = view.rows.find((r) => r.orderId === 'order-loss')!;
    const zeroRow = view.rows.find((r) => r.orderId === 'order-zero')!;
    const profitRow = view.rows.find((r) => r.orderId === 'order-profit')!;
    expect(lossRow.isLoss).toBe(true);
    expect(zeroRow.isLoss).toBe(false);
    expect(profitRow.isLoss).toBe(false);
  });

  it('grand totals equal the sum of all rows', () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 0 })];
    const orders = [
      buildOrder({ id: 'order-1', totalUSD: 500, commissionMN: 3000, exchangeRateSnapshot: { usdToMn: 40 }, items: [] }),
      buildOrder({ id: 'order-2', totalUSD: -20, commissionMN: 0, exchangeRateSnapshot: { usdToMn: 40 }, items: [] }),
    ];
    const state = buildState({ products, orders });

    const view = buildProfitabilityRanking(state);

    expect(view.count).toBe(2);
    // order-1: revenue 500, cost 0, commission 75, margin 425
    // order-2: revenue -20, cost 0, commission 0, margin -20
    expect(view.totals.revenueUSD).toBe(480);
    expect(view.totals.costUSD).toBe(0);
    expect(view.totals.commissionUSD).toBe(75);
    expect(view.totals.marginUSD).toBe(405);
  });
});
