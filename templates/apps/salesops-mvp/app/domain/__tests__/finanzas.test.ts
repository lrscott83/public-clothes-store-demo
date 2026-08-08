import { describe, expect, it } from 'vitest';
import { buildFinanceSummary } from '../finanzas';
import type { Order, SeedState } from '../types';

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

describe('buildFinanceSummary', () => {
  it('splits commission into paid, pending, and total KPIs', () => {
    const orders = [
      buildOrder({ id: 'order-paid', state: 'comision_pagada', commissionMN: 3000 }),
      buildOrder({ id: 'order-verificado', state: 'verificado', commissionMN: 1000 }),
      buildOrder({ id: 'order-entregado', state: 'entregado', commissionMN: 2000 }),
    ];
    const state = buildState({ orders });

    const view = buildFinanceSummary(state);

    expect(view.kpis.commissionPaidMN).toBe(3000);
    expect(view.kpis.commissionPendingMN).toBe(3000);
    expect(view.kpis.commissionTotalMN).toBe(6000);
  });

  it('counts pendingPaymentCount only for verificado/transportando/entregado', () => {
    const orders = [
      buildOrder({ id: 'order-paid', state: 'comision_pagada', commissionMN: 3000 }),
      buildOrder({ id: 'order-verificado', state: 'verificado', commissionMN: 1000 }),
      buildOrder({ id: 'order-entregado', state: 'entregado', commissionMN: 2000 }),
      buildOrder({ id: 'order-creado', state: 'creado', commissionMN: undefined, exchangeRateSnapshot: undefined }),
    ];
    const state = buildState({ orders });

    const view = buildFinanceSummary(state);

    expect(view.kpis.pendingPaymentCount).toBe(2);
  });

  it('a creado order with no frozen commissionMN contributes 0 to every KPI', () => {
    const orders = [
      buildOrder({
        id: 'order-creado',
        state: 'creado',
        commissionMN: undefined,
        exchangeRateSnapshot: undefined,
      }),
    ];
    const state = buildState({ orders });

    const view = buildFinanceSummary(state);

    expect(view.kpis.commissionPaidMN).toBe(0);
    expect(view.kpis.commissionPendingMN).toBe(0);
    expect(view.kpis.commissionTotalMN).toBe(0);
    expect(view.kpis.pendingPaymentCount).toBe(0);
  });

  it('treats an order with only commissionPaidAt set (any state) as paid, not pending', () => {
    const orders = [
      buildOrder({ id: 'order-state-paid', state: 'comision_pagada', commissionMN: 1500 }),
      buildOrder({
        id: 'order-paidat-only',
        state: 'entregado',
        commissionMN: 2500,
        commissionPaidAt: '2024-02-01T00:00:00.000Z',
      }),
    ];
    const state = buildState({ orders });

    const view = buildFinanceSummary(state);

    expect(view.kpis.commissionPaidMN).toBe(4000);
    expect(view.kpis.commissionPendingMN).toBe(0);
    expect(view.kpis.pendingPaymentCount).toBe(0);
  });

  it('aggregates count, revenueUSD, and commissionMN per state', () => {
    const orders = [
      buildOrder({ id: 'order-e1', state: 'entregado', totalUSD: 100, commissionMN: 10 }),
      buildOrder({ id: 'order-e2', state: 'entregado', totalUSD: 150, commissionMN: 20 }),
    ];
    const state = buildState({ orders });

    const view = buildFinanceSummary(state);

    const entregadoRow = view.rows.find((r) => r.state === 'entregado')!;
    expect(entregadoRow.count).toBe(2);
    expect(entregadoRow.revenueUSD).toBe(250);
    expect(entregadoRow.commissionMN).toBe(30);
  });

  it('the creado row shows revenueUSD but commissionMN is 0, never NaN/undefined', () => {
    const orders = [
      buildOrder({
        id: 'order-creado',
        state: 'creado',
        totalUSD: 80,
        commissionMN: undefined,
        exchangeRateSnapshot: undefined,
      }),
    ];
    const state = buildState({ orders });

    const view = buildFinanceSummary(state);

    const creadoRow = view.rows.find((r) => r.state === 'creado')!;
    expect(creadoRow.revenueUSD).toBe(80);
    expect(creadoRow.commissionMN).toBe(0);
  });

  it('rows has exactly 5 entries in fixed order, with zero-count states for empty buckets', () => {
    const orders = [
      buildOrder({
        id: 'order-creado',
        state: 'creado',
        commissionMN: undefined,
        exchangeRateSnapshot: undefined,
      }),
      buildOrder({ id: 'order-entregado', state: 'entregado', commissionMN: 500 }),
    ];
    const state = buildState({ orders });

    const view = buildFinanceSummary(state);

    expect(view.rows).toHaveLength(5);
    expect(view.rows.map((r) => r.state)).toEqual([
      'creado',
      'verificado',
      'transportando',
      'entregado',
      'comision_pagada',
    ]);
    const verificadoRow = view.rows.find((r) => r.state === 'verificado')!;
    const transportandoRow = view.rows.find((r) => r.state === 'transportando')!;
    const comisionPagadaRow = view.rows.find((r) => r.state === 'comision_pagada')!;
    expect(verificadoRow.count).toBe(0);
    expect(transportandoRow.count).toBe(0);
    expect(comisionPagadaRow.count).toBe(0);
  });

  it('an all-empty state yields 5 zero rows and all-zero KPIs, without throwing', () => {
    const state = buildState({ orders: [] });

    expect(() => buildFinanceSummary(state)).not.toThrow();
    const view = buildFinanceSummary(state);

    expect(view.rows).toHaveLength(5);
    for (const row of view.rows) {
      expect(row.count).toBe(0);
      expect(row.revenueUSD).toBe(0);
      expect(row.commissionMN).toBe(0);
    }
    expect(view.kpis.commissionPaidMN).toBe(0);
    expect(view.kpis.commissionPendingMN).toBe(0);
    expect(view.kpis.commissionTotalMN).toBe(0);
    expect(view.kpis.pendingPaymentCount).toBe(0);
  });
});
