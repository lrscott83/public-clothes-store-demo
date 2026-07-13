import { describe, expect, it } from 'vitest';
import {
  buildCashFlowTrend,
  buildCurrencyExposure,
  buildFinanceDashboard,
  buildFinanceKpiHeader,
  buildGestorCommissionCost,
  buildWarehouseCashFlow,
} from '../finanzas-dashboard';
import type { Order, SeedState, SeededProduct } from '../types';

const GENERATED_AT = '2026-07-10T12:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBefore(days: number): string {
  return new Date(new Date(GENERATED_AT).getTime() - days * DAY_MS).toISOString();
}

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
    totalMN: 20000,
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

describe('buildFinanceKpiHeader', () => {
  it('computes windowed Σ totalUSD / Σ totalMN over qualifying orders for facturado/liquidado', () => {
    const orders = [
      buildOrder({ id: 'order-1', totalUSD: 500, totalMN: 20000, createdAt: daysBefore(2) }),
      buildOrder({ id: 'order-2', totalUSD: 300, totalMN: 12000, createdAt: daysBefore(3) }),
    ];
    const state = buildState({ orders });

    const view = buildFinanceKpiHeader(state);

    expect(view.ingresosFacturadosUSD.current).toBe(800);
    expect(view.ingresosLiquidadosMN.current).toBe(32000);
  });

  it('splits cobrado (entregado/comision_pagada) vs pendiente (verificado/transportando) by USD', () => {
    const orders = [
      buildOrder({ id: 'order-entregado', state: 'entregado', totalUSD: 100, createdAt: daysBefore(1) }),
      buildOrder({ id: 'order-pagada', state: 'comision_pagada', totalUSD: 50, createdAt: daysBefore(1) }),
      buildOrder({ id: 'order-verificado', state: 'verificado', totalUSD: 200, createdAt: daysBefore(1) }),
      buildOrder({ id: 'order-transportando', state: 'transportando', totalUSD: 75, createdAt: daysBefore(1) }),
    ];
    const state = buildState({ orders });

    const view = buildFinanceKpiHeader(state);

    expect(view.cobradoUSD.current).toBe(150);
    expect(view.pendienteUSD.current).toBe(275);
  });

  it('comisionPendienteMN sums unpaid verificado/transportando/entregado commission, excluding paid orders', () => {
    const orders = [
      buildOrder({
        id: 'order-verificado',
        state: 'verificado',
        commissionMN: 1000,
        commissionPaidAt: undefined,
        createdAt: daysBefore(1),
      }),
      buildOrder({
        id: 'order-entregado',
        state: 'entregado',
        commissionMN: 2000,
        commissionPaidAt: undefined,
        createdAt: daysBefore(2),
      }),
      buildOrder({
        id: 'order-paid',
        state: 'comision_pagada',
        commissionMN: 3000,
        createdAt: daysBefore(3),
      }),
    ];
    const state = buildState({ orders });

    const view = buildFinanceKpiHeader(state);

    expect(view.comisionPendienteMN.current).toBe(3000);
  });

  it('margenNetoUSD sums totalUSD - cost - commissionUSD across qualifying current-window orders, with margenPercent derived', () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 4 })];
    const orders = [
      buildOrder({
        id: 'order-1',
        totalUSD: 500,
        commissionMN: 3000,
        exchangeRateSnapshot: { usdToMn: 40 },
        items: [{ productId: 'p-1', quantity: 50, priceUSD: 10, commissionMN: 5 }],
        createdAt: daysBefore(2),
      }),
    ];
    const state = buildState({ products, orders });

    const view = buildFinanceKpiHeader(state);

    // margin = 500 - (50*4) - (3000/40) = 500 - 200 - 75 = 225
    expect(view.margenNetoUSD.current).toBe(225);
    expect(view.margenPercent).toBeCloseTo(45, 5); // 225/500 * 100
  });

  it('yields delta:null and an "up" trend (never Infinity) when the prior window is 0', () => {
    const orders = [buildOrder({ id: 'order-1', totalUSD: 500, createdAt: daysBefore(2) })];
    const state = buildState({ orders });

    const view = buildFinanceKpiHeader(state);

    expect(view.ingresosFacturadosUSD.prior).toBe(0);
    expect(view.ingresosFacturadosUSD.delta).toBeNull();
    expect(view.ingresosFacturadosUSD.trend).toBe('up');
  });

  it('MN fields never produce NaN for a qualifying order with an undefined totalMN', () => {
    const orders = [
      buildOrder({ id: 'order-1', state: 'verificado', totalMN: undefined, createdAt: daysBefore(1) }),
    ];
    const state = buildState({ orders });

    const view = buildFinanceKpiHeader(state);

    expect(Number.isNaN(view.ingresosLiquidadosMN.current)).toBe(false);
    expect(view.ingresosLiquidadosMN.current).toBe(0);
  });
});

describe('buildCashFlowTrend', () => {
  it('zero-fills all 20 days, splitting cobrado vs pendiente by state, ordered oldest to newest', () => {
    const orders: Order[] = [];
    for (let offset = 0; offset < 20; offset++) {
      if (offset === 5) continue; // intentionally empty day
      orders.push(
        buildOrder({
          id: `order-${offset}`,
          state: offset % 2 === 0 ? 'entregado' : 'verificado',
          totalUSD: 100,
          createdAt: daysBefore(offset),
        }),
      );
    }
    const state = buildState({ orders });

    const view = buildCashFlowTrend(state);

    expect(view.points).toHaveLength(20);
    expect(view.points[0].dayOffset).toBe(19);
    expect(view.points[19].dayOffset).toBe(0);

    const emptyDay = view.points.find((p) => p.dayOffset === 5)!;
    expect(emptyDay.cobradoUSD).toBe(0);
    expect(emptyDay.pendienteUSD).toBe(0);

    const entregadoDay = view.points.find((p) => p.dayOffset === 0)!;
    expect(entregadoDay.cobradoUSD).toBe(100);
    expect(entregadoDay.pendienteUSD).toBe(0);

    const verificadoDay = view.points.find((p) => p.dayOffset === 1)!;
    expect(verificadoDay.cobradoUSD).toBe(0);
    expect(verificadoDay.pendienteUSD).toBe(100);
  });

  it('excludes creado orders from every bucket', () => {
    const orders = [buildOrder({ id: 'order-creado', state: 'creado', totalUSD: 999, createdAt: daysBefore(0) })];
    const state = buildState({ orders });

    const view = buildCashFlowTrend(state);

    const day0 = view.points.find((p) => p.dayOffset === 0)!;
    expect(day0.cobradoUSD).toBe(0);
    expect(day0.pendienteUSD).toBe(0);
  });
});

describe('buildCurrencyExposure', () => {
  it('groups qualifying orders by payment method into revenueUSD + percent, flagging hard-currency methods', () => {
    const orders = [
      buildOrder({ id: 'usd-1', payment: { method: 'USD' }, totalUSD: 400 }),
      buildOrder({ id: 'mn-1', payment: { method: 'MN' }, totalUSD: 100 }),
      buildOrder({ id: 'zelle-1', payment: { method: 'ZELLE' }, totalUSD: 300 }),
      buildOrder({ id: 'eur-1', payment: { method: 'EUR' }, totalUSD: 200 }),
    ];
    const state = buildState({ orders });

    const view = buildCurrencyExposure(state);

    const usd = view.slices.find((s) => s.method === 'USD')!;
    expect(usd.revenueUSD).toBe(400);
    expect(usd.percent).toBe(40);
    expect(usd.isHardCurrency).toBe(true);

    const mn = view.slices.find((s) => s.method === 'MN')!;
    expect(mn.isHardCurrency).toBe(false);
  });

  it('groups an unrecognized payment method into an "otros" bucket, flagged as local (not hard currency)', () => {
    const orders = [
      buildOrder({ id: 'order-crypto', payment: { method: 'CRYPTO' }, totalUSD: 50 }),
      buildOrder({ id: 'order-usd', payment: { method: 'USD' }, totalUSD: 50 }),
    ];
    const state = buildState({ orders });

    expect(() => buildCurrencyExposure(state)).not.toThrow();
    const view = buildCurrencyExposure(state);
    const otros = view.slices.find((s) => s.method === 'otros')!;
    expect(otros.revenueUSD).toBe(50);
    expect(otros.isHardCurrency).toBe(false);
  });
});

describe('buildGestorCommissionCost', () => {
  it("computes a gestor's revenue, earned/pending/paid commission, take-rate, and ROI", () => {
    const gestores = [{ id: 'g1', name: 'Gestor Uno' }];
    const orders = [
      buildOrder({
        id: 'order-1',
        gestorId: 'g1',
        state: 'entregado',
        totalUSD: 400,
        commissionMN: 800,
        exchangeRateSnapshot: { usdToMn: 40 },
        commissionPaidAt: '2026-07-05T00:00:00.000Z',
      }),
    ];
    const state = buildState({ gestores, orders });

    const view = buildGestorCommissionCost(state);
    const row = view.rows.find((r) => r.gestorId === 'g1')!;

    expect(row.revenueUSD).toBe(400);
    expect(row.commissionEarnedMN).toBe(800);
    expect(row.commissionPendingMN).toBe(0); // paid via commissionPaidAt
    expect(row.commissionPaidMN).toBe(800); // earned - pending
    // commissionEarnedUSD = 800/40 = 20; takeRate = 20/400*100 = 5
    expect(row.takeRatePercent).toBeCloseTo(5, 5);
    // roi = revenueUSD / commissionEarnedUSD = 400/20 = 20
    expect(row.roi).toBeCloseTo(20, 5);
  });

  it('includes a zero-order gestor as an all-zero row (÷0 guarded), never omitted', () => {
    const gestores = [
      { id: 'g1', name: 'Gestor Uno' },
      { id: 'g2', name: 'Gestor Dos' },
    ];
    const orders = [buildOrder({ id: 'order-1', gestorId: 'g1', totalUSD: 500 })];
    const state = buildState({ gestores, orders });

    const view = buildGestorCommissionCost(state);
    const g2 = view.rows.find((r) => r.gestorId === 'g2')!;

    expect(g2.revenueUSD).toBe(0);
    expect(g2.commissionEarnedMN).toBe(0);
    expect(g2.commissionPendingMN).toBe(0);
    expect(g2.commissionPaidMN).toBe(0);
    expect(g2.takeRatePercent).toBe(0);
    expect(g2.roi).toBe(0);
    expect(Number.isFinite(g2.takeRatePercent)).toBe(true);
    expect(Number.isFinite(g2.roi)).toBe(true);
  });
});

describe('buildWarehouseCashFlow', () => {
  it('splits each warehouse into cobrado/pendiente USD, zero-order warehouse still appears at 0', () => {
    const warehouses = [
      { id: 'wh-1', name: 'Almacén 1' },
      { id: 'wh-2', name: 'Almacén 2' },
    ];
    const orders = [
      buildOrder({ id: 'order-1', warehouseId: 'wh-1', state: 'entregado', totalUSD: 300 }),
      buildOrder({ id: 'order-2', warehouseId: 'wh-1', state: 'verificado', totalUSD: 100 }),
    ];
    const state = buildState({ warehouses, orders });

    const view = buildWarehouseCashFlow(state);

    const wh1 = view.rows.find((r) => r.warehouseId === 'wh-1')!;
    expect(wh1.cobradoUSD).toBe(300);
    expect(wh1.pendienteUSD).toBe(100);

    const wh2 = view.rows.find((r) => r.warehouseId === 'wh-2')!;
    expect(wh2.cobradoUSD).toBe(0);
    expect(wh2.pendienteUSD).toBe(0);
  });

  it('sorts warehouses descending by total (cobrado + pendiente)', () => {
    const warehouses = [
      { id: 'wh-low', name: 'Bajo' },
      { id: 'wh-high', name: 'Alto' },
    ];
    const orders = [
      buildOrder({ id: 'order-low', warehouseId: 'wh-low', state: 'entregado', totalUSD: 50 }),
      buildOrder({ id: 'order-high', warehouseId: 'wh-high', state: 'entregado', totalUSD: 500 }),
    ];
    const state = buildState({ warehouses, orders });

    const view = buildWarehouseCashFlow(state);

    expect(view.rows.map((r) => r.warehouseId)).toEqual(['wh-high', 'wh-low']);
  });
});

describe('buildFinanceDashboard', () => {
  it('hasData is false when every order is creado (or the seed is empty)', () => {
    const state = buildState({ orders: [buildOrder({ id: 'order-1', state: 'creado' })] });

    const view = buildFinanceDashboard(state);

    expect(view.hasData).toBe(false);
  });

  it('hasData is true when at least one order is verificado or later', () => {
    const state = buildState({ orders: [buildOrder({ id: 'order-1', state: 'verificado' })] });

    const view = buildFinanceDashboard(state);

    expect(view.hasData).toBe(true);
  });

  it('composes buildFinanceSummary unchanged (commissionLiability/revenueByState/stateBreakdown) plus its own helpers, without throwing on an empty seed', () => {
    const state = buildState();

    expect(() => buildFinanceDashboard(state)).not.toThrow();
    const view = buildFinanceDashboard(state);

    expect(view.stateBreakdown).toHaveLength(5);
    expect(view.commissionLiability).toEqual({ paidMN: 0, pendingMN: 0 });
    expect(view.revenueByState.rows).toHaveLength(5);
    expect(view.cashFlowTrend.points).toHaveLength(20);
    expect(view.currencyExposure.slices).toEqual([]);
    expect(view.gestorCommission.rows).toEqual([]);
    expect(view.warehouseCashFlow.rows).toEqual([]);
  });

  it("a later live-rate edit does not change an already-computed figure — uses the order's frozen exchangeRateSnapshot.usdToMn", () => {
    const gestores = [{ id: 'g1', name: 'Gestor Uno' }];
    const orders = [
      buildOrder({
        id: 'order-1',
        gestorId: 'g1',
        state: 'verificado',
        totalUSD: 500,
        commissionMN: 2000,
        exchangeRateSnapshot: { usdToMn: 40 },
      }),
    ];
    const state = buildState({ gestores, orders, exchangeRates: { usdToMn: 40, zelle: 1, eur: 1 } });

    const before = buildGestorCommissionCost(state);
    const rowBefore = before.rows.find((r) => r.gestorId === 'g1')!;
    expect(rowBefore.takeRatePercent).toBeCloseTo(10, 5); // (2000/40)/500*100

    state.exchangeRates.usdToMn = 100;

    const after = buildGestorCommissionCost(state);
    const rowAfter = after.rows.find((r) => r.gestorId === 'g1')!;
    expect(rowAfter.takeRatePercent).toBeCloseTo(10, 5);
  });
});
