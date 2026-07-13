import { describe, expect, it } from 'vitest';
import { buildKpiTrend, computeDelta, computeTrend, splitByPeriod } from '../period-trend';
import type { Order, SeedState } from '../types';

const GENERATED_AT = '2026-07-10T12:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBefore(days: number): string {
  return new Date(new Date(GENERATED_AT).getTime() - days * DAY_MS).toISOString();
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
    createdAt: daysBefore(1),
    ...overrides,
  };
}

function buildState(overrides: Partial<SeedState> = {}): SeedState {
  return {
    version: 1,
    generatedAt: GENERATED_AT,
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

describe('splitByPeriod', () => {
  it('buckets an order 5 days before generatedAt into current, and 15 days before into prior', () => {
    const orders = [
      buildOrder({ id: 'order-current', createdAt: daysBefore(5) }),
      buildOrder({ id: 'order-prior', createdAt: daysBefore(15) }),
    ];
    const state = buildState({ orders });

    const { current, prior } = splitByPeriod(state);

    expect(current.map((o) => o.id)).toEqual(['order-current']);
    expect(prior.map((o) => o.id)).toEqual(['order-prior']);
  });

  it('is anchored to state.generatedAt, not the wall-clock date', () => {
    const oldGeneratedAt = '2020-01-10T12:00:00.000Z';
    const createdAt = new Date(new Date(oldGeneratedAt).getTime() - 5 * DAY_MS).toISOString();
    const state = buildState({
      generatedAt: oldGeneratedAt,
      orders: [buildOrder({ id: 'order-old', createdAt })],
    });

    const { current } = splitByPeriod(state);

    expect(current.map((o) => o.id)).toEqual(['order-old']);
  });

  it('drops an order older than the 20-day window from both buckets', () => {
    const state = buildState({
      orders: [buildOrder({ id: 'order-ancient', createdAt: daysBefore(30) })],
    });

    const { current, prior } = splitByPeriod(state);

    expect(current).toEqual([]);
    expect(prior).toEqual([]);
  });
});

describe('computeTrend', () => {
  it('returns "flat" when both current and prior are 0', () => {
    expect(computeTrend(0, 0)).toBe('flat');
  });

  it('returns "up" when prior is 0 and current is positive (never Infinity-driven)', () => {
    expect(computeTrend(500, 0)).toBe('up');
  });

  it('returns "up" when current exceeds prior', () => {
    expect(computeTrend(200, 100)).toBe('up');
  });

  it('returns "down" when current is below prior', () => {
    expect(computeTrend(50, 100)).toBe('down');
  });

  it('returns "flat" when current equals a positive prior', () => {
    expect(computeTrend(100, 100)).toBe('flat');
  });
});

describe('computeDelta', () => {
  it('returns null when prior is 0', () => {
    expect(computeDelta(500, 0)).toBeNull();
  });

  it('computes the fractional change when prior is positive', () => {
    expect(computeDelta(200, 100)).toBe(1);
    expect(computeDelta(50, 100)).toBe(-0.5);
  });
});

describe('buildKpiTrend', () => {
  it('assembles current/prior/delta/trend into one object, with a safe up-trend when prior is 0', () => {
    const result = buildKpiTrend(500, 0);

    expect(result).toEqual({ current: 500, prior: 0, delta: null, trend: 'up' });
  });

  it('computes a numeric delta and "down" trend when current is below a positive prior', () => {
    const result = buildKpiTrend(50, 100);

    expect(result).toEqual({ current: 50, prior: 100, delta: -0.5, trend: 'down' });
  });
});
