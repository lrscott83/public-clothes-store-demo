import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STATES,
  STAGE_DELAY_THRESHOLD_DAYS,
  buildActiveOrdersByStateAndWarehouse,
  buildComisionesPorPagar,
  buildCurrencyMix,
  buildDecisionesDashboard,
  buildGestorRanking,
  buildInventoryAlerts,
  buildKpiHeader,
  buildPedidosDemorados,
  buildSalesTrend,
  buildStageDistribution,
  buildTransportistaCapacity,
  buildWarehouseSales,
  splitByPeriod,
  windowedState,
} from '../decisiones-dashboard';
import type { InventoryEntry, Order, SeedState, SeededProduct } from '../types';

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
    // an order created "5 days before" a generatedAt far in the past must
    // still land in `current` — this only holds if the anchor is generatedAt.
    const oldGeneratedAt = '2020-01-10T12:00:00.000Z';
    const createdAt = new Date(new Date(oldGeneratedAt).getTime() - 5 * DAY_MS).toISOString();
    const state = buildState({
      generatedAt: oldGeneratedAt,
      orders: [buildOrder({ id: 'order-old', createdAt })],
    });

    const { current } = splitByPeriod(state);

    expect(current.map((o) => o.id)).toEqual(['order-old']);
  });
});

describe('buildKpiHeader', () => {
  it('computes Ventas, Margen, and Pedidos from revenue, cost, and commission', () => {
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
      buildOrder({
        id: 'order-2',
        totalUSD: 300,
        commissionMN: 1000,
        exchangeRateSnapshot: { usdToMn: 40 },
        items: [{ productId: 'p-1', quantity: 25, priceUSD: 10, commissionMN: 5 }],
        createdAt: daysBefore(3),
      }),
    ];
    const state = buildState({ products, orders });

    const view = buildKpiHeader(state);

    expect(view.ventasUSD.current).toBe(800);
    expect(view.margenUSD.current).toBe(400); // (500-200-75) + (300-100-25)
    expect(view.pedidos.current).toBe(2);
  });

  it('yields an "up" trend with no Infinity/NaN when the prior window is 0', () => {
    const orders = [buildOrder({ id: 'order-1', totalUSD: 500, createdAt: daysBefore(2) })];
    const state = buildState({ orders });

    const view = buildKpiHeader(state);

    expect(view.ventasUSD.prior).toBe(0);
    expect(view.ventasUSD.current).toBe(500);
    expect(view.ventasUSD.trend).toBe('up');
    expect(view.ventasUSD.delta).not.toBe(Infinity);
    expect(Number.isNaN(view.ventasUSD.delta)).toBe(false);
  });

  it('yields a "flat" trend when both windows are 0', () => {
    const state = buildState({ orders: [] });

    const view = buildKpiHeader(state);

    expect(view.ventasUSD.current).toBe(0);
    expect(view.ventasUSD.prior).toBe(0);
    expect(view.ventasUSD.trend).toBe('flat');
    expect(view.ventasUSD.delta).toBeNull();
  });

  it('computes a numeric delta when the prior window is > 0', () => {
    const orders = [
      buildOrder({ id: 'order-current', totalUSD: 200, createdAt: daysBefore(2) }),
      buildOrder({ id: 'order-prior', totalUSD: 100, createdAt: daysBefore(12) }),
    ];
    const state = buildState({ orders });

    const view = buildKpiHeader(state);

    expect(view.ventasUSD.current).toBe(200);
    expect(view.ventasUSD.prior).toBe(100);
    expect(view.ventasUSD.delta).toBe(1); // (200-100)/100
    expect(view.ventasUSD.trend).toBe('up');
  });

  it('Comisión pendiente sums unpaid verificado/transportando/entregado orders, excluding paid ones', () => {
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

    const view = buildKpiHeader(state);

    expect(view.comisionPendienteMN.current).toBe(3000);
  });
});

describe('buildSalesTrend', () => {
  it('includes a day with zero qualifying orders as a zero point, not omitted', () => {
    const orders: Order[] = [];
    for (let offset = 0; offset < 20; offset++) {
      if (offset === 7) continue; // day 7 intentionally has no orders
      orders.push(
        buildOrder({
          id: `order-${offset}`,
          totalUSD: 100,
          createdAt: daysBefore(offset),
        }),
      );
    }
    const state = buildState({ orders });

    const view = buildSalesTrend(state);

    expect(view.points).toHaveLength(20);
    const zeroDay = view.points.find((p) => p.dayOffset === 7)!;
    expect(zeroDay.count).toBe(0);
    expect(zeroDay.valueUSD).toBe(0);
    const populatedDay = view.points.find((p) => p.dayOffset === 0)!;
    expect(populatedDay.count).toBe(1);
    expect(populatedDay.valueUSD).toBe(100);
  });

  it('excludes creado orders from the trend', () => {
    const orders = [buildOrder({ id: 'order-creado', state: 'creado', totalUSD: 999, createdAt: daysBefore(0) })];
    const state = buildState({ orders });

    const view = buildSalesTrend(state);

    const day0 = view.points.find((p) => p.dayOffset === 0)!;
    expect(day0.count).toBe(0);
    expect(day0.valueUSD).toBe(0);
  });
});

describe('buildStageDistribution', () => {
  it('returns exactly 5 entries in fixed order, counting creado too, zero-count states included', () => {
    const orders = [
      buildOrder({ id: 'order-creado', state: 'creado' }),
      buildOrder({ id: 'order-entregado', state: 'entregado' }),
    ];
    const state = buildState({ orders });

    const view = buildStageDistribution(state);

    expect(view.rows).toHaveLength(5);
    expect(view.rows.map((r) => r.state)).toEqual([
      'creado',
      'verificado',
      'transportando',
      'entregado',
      'comision_pagada',
    ]);
    expect(view.rows.find((r) => r.state === 'creado')!.count).toBe(1);
    expect(view.rows.find((r) => r.state === 'entregado')!.count).toBe(1);
    expect(view.rows.find((r) => r.state === 'verificado')!.count).toBe(0);
    expect(view.rows.find((r) => r.state === 'transportando')!.count).toBe(0);
    expect(view.rows.find((r) => r.state === 'comision_pagada')!.count).toBe(0);
  });
});

describe('buildWarehouseSales', () => {
  it('includes every warehouse, with a zero-sale warehouse showing revenueUSD:0, count:0', () => {
    const warehouses = [
      { id: 'wh-1', name: 'Almacén 1' },
      { id: 'wh-2', name: 'Almacén 2' },
      { id: 'wh-3', name: 'Almacén 3' },
    ];
    const orders = [
      buildOrder({ id: 'order-1', warehouseId: 'wh-1', totalUSD: 100 }),
      buildOrder({ id: 'order-2', warehouseId: 'wh-2', totalUSD: 200 }),
    ];
    const state = buildState({ warehouses, orders });

    const view = buildWarehouseSales(state);

    expect(view.rows).toHaveLength(3);
    const wh3 = view.rows.find((r) => r.warehouseId === 'wh-3')!;
    expect(wh3.revenueUSD).toBe(0);
    expect(wh3.count).toBe(0);
  });
});

describe('buildCurrencyMix', () => {
  it('produces one bucket per known method with correct counts and percent share', () => {
    const orders = [
      ...Array.from({ length: 4 }, (_, i) => buildOrder({ id: `usd-${i}`, payment: { method: 'USD' } })),
      ...Array.from({ length: 3 }, (_, i) => buildOrder({ id: `mn-${i}`, payment: { method: 'MN' } })),
      ...Array.from({ length: 2 }, (_, i) => buildOrder({ id: `zelle-${i}`, payment: { method: 'ZELLE' } })),
      buildOrder({ id: 'eur-0', payment: { method: 'EUR' } }),
    ];
    const state = buildState({ orders });

    const view = buildCurrencyMix(state);

    expect(view.buckets).toHaveLength(4);
    const usd = view.buckets.find((b) => b.method === 'USD')!;
    expect(usd.count).toBe(4);
    expect(usd.percent).toBe(40);
  });

  it('groups an unrecognized payment method into "otros" without throwing', () => {
    const orders = [
      buildOrder({ id: 'order-crypto', payment: { method: 'CRYPTO' } }),
      buildOrder({ id: 'order-usd', payment: { method: 'USD' } }),
    ];
    const state = buildState({ orders });

    expect(() => buildCurrencyMix(state)).not.toThrow();
    const view = buildCurrencyMix(state);
    const otros = view.buckets.find((b) => b.method === 'otros')!;
    expect(otros.count).toBe(1);
  });
});

describe('buildGestorRanking', () => {
  it("aggregates a gestor's own orders into revenueUSD/aov/commissionEarnedMN/commissionPendingMN", () => {
    const gestores = [{ id: 'g1', name: 'Gestor Uno' }];
    const orders = [
      buildOrder({
        id: 'order-1',
        gestorId: 'g1',
        state: 'verificado',
        totalUSD: 400,
        commissionMN: 800,
        commissionPaidAt: undefined,
      }),
    ];
    const state = buildState({ gestores, orders });

    const view = buildGestorRanking(state);

    const row = view.rows.find((r) => r.gestorId === 'g1')!;
    expect(row.revenueUSD).toBe(400);
    expect(row.aovUSD).toBe(400);
    expect(row.commissionEarnedMN).toBe(800);
    expect(row.commissionPendingMN).toBe(800);
  });

  it('includes a gestor with zero orders as an all-zero row, not omitted, sorted desc by revenueUSD', () => {
    const gestores = [
      { id: 'g1', name: 'Gestor Uno' },
      { id: 'g2', name: 'Gestor Dos' },
    ];
    const orders = [buildOrder({ id: 'order-1', gestorId: 'g1', totalUSD: 500 })];
    const state = buildState({ gestores, orders });

    const view = buildGestorRanking(state);

    expect(view.rows).toHaveLength(2);
    const g2 = view.rows.find((r) => r.gestorId === 'g2')!;
    expect(g2.revenueUSD).toBe(0);
    expect(g2.count).toBe(0);
    expect(g2.aovUSD).toBe(0);
    expect(g2.commissionEarnedMN).toBe(0);
    expect(g2.commissionPendingMN).toBe(0);
    expect(view.rows.map((r) => r.gestorId)).toEqual(['g1', 'g2']);
  });
});

describe('buildInventoryAlerts', () => {
  it('classifies quantity:0 as agotado, quantity:2 as bajo, quantity:10 excluded (normal)', () => {
    const products = [
      buildProduct({ id: 'p-agotado' }),
      buildProduct({ id: 'p-bajo' }),
      buildProduct({ id: 'p-normal' }),
    ];
    const warehouses = [{ id: 'wh-1', name: 'Almacén 1' }];
    const inventory: InventoryEntry[] = [
      { productId: 'p-agotado', warehouseId: 'wh-1', quantity: 0 },
      { productId: 'p-bajo', warehouseId: 'wh-1', quantity: 2 },
      { productId: 'p-normal', warehouseId: 'wh-1', quantity: 10 },
    ];
    const state = buildState({ products, warehouses, inventory });

    const view = buildInventoryAlerts(state);

    const group = view.groups.find((g) => g.warehouseId === 'wh-1')!;
    const agotado = group.rows.find((r) => r.productId === 'p-agotado')!;
    const bajo = group.rows.find((r) => r.productId === 'p-bajo')!;
    expect(agotado.level).toBe('agotado');
    expect(bajo.level).toBe('bajo');
    expect(group.rows.find((r) => r.productId === 'p-normal')).toBeUndefined();
  });

  it('skips an orphan productId without throwing, grouped by warehouseId', () => {
    const products = [buildProduct({ id: 'p-1' })];
    const warehouses = [{ id: 'wh-1', name: 'Almacén 1' }];
    const inventory: InventoryEntry[] = [
      { productId: 'p-1', warehouseId: 'wh-1', quantity: 0 },
      { productId: 'orphan-id', warehouseId: 'wh-1', quantity: 0 },
    ];
    const state = buildState({ products, warehouses, inventory });

    expect(() => buildInventoryAlerts(state)).not.toThrow();
    const view = buildInventoryAlerts(state);
    const group = view.groups.find((g) => g.warehouseId === 'wh-1')!;
    expect(group.rows).toHaveLength(1);
    expect(group.rows[0].productId).toBe('p-1');
  });
});

describe('orphan productId in margin/cost aggregation', () => {
  it('contributes 0 to KPI margin without throwing, while the rest of the order and other orders still aggregate', () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 4 })];
    const orders = [
      buildOrder({
        id: 'order-1',
        totalUSD: 500,
        commissionMN: 0,
        items: [
          { productId: 'p-1', quantity: 10, priceUSD: 10, commissionMN: 0 },
          { productId: 'orphan-id', quantity: 99, priceUSD: 10, commissionMN: 0 },
        ],
        createdAt: daysBefore(1),
      }),
    ];
    const state = buildState({ products, orders });

    expect(() => buildKpiHeader(state)).not.toThrow();
    const view = buildKpiHeader(state);
    // cost only counts p-1: 10 * 4 = 40; margin = 500 - 40 - 0 = 460
    expect(view.margenUSD.current).toBe(460);
  });

});

describe('live-rate regression', () => {
  it("a later live-rate edit does not change an order's already-computed KPI contribution", () => {
    const products = [buildProduct({ id: 'p-1', costUSD: 4 })];
    const orders = [
      buildOrder({
        id: 'order-1',
        totalUSD: 500,
        commissionMN: 3000,
        exchangeRateSnapshot: { usdToMn: 40 },
        items: [{ productId: 'p-1', quantity: 10, priceUSD: 10, commissionMN: 0 }],
        createdAt: daysBefore(1),
      }),
    ];
    const state = buildState({ products, orders, exchangeRates: { usdToMn: 40, zelle: 1, eur: 1 } });

    const before = buildKpiHeader(state);
    expect(before.margenUSD.current).toBe(385); // 500 - 40 - 75

    state.exchangeRates.usdToMn = 45;

    const after = buildKpiHeader(state);
    expect(after.margenUSD.current).toBe(385);
  });
});

describe('ACTIVE_STATES', () => {
  it('is exactly the 3 non-completed states, in order', () => {
    expect(ACTIVE_STATES).toEqual(['creado', 'verificado', 'transportando']);
  });
});

describe('STAGE_DELAY_THRESHOLD_DAYS', () => {
  it('holds the owner-confirmed per-stage thresholds', () => {
    expect(STAGE_DELAY_THRESHOLD_DAYS).toEqual({ creado: 2, verificado: 3, transportando: 2 });
  });
});

describe('windowedState', () => {
  it('filters orders to [anchor-Nd, anchor), anchored to state.generatedAt', () => {
    const orders = [
      buildOrder({ id: 'order-in', createdAt: daysBefore(3) }),
      buildOrder({ id: 'order-out-old', createdAt: daysBefore(10) }),
      buildOrder({ id: 'order-out-future', createdAt: daysBefore(-1) }),
    ];
    const state = buildState({ orders });

    const windowed = windowedState(state, 7);

    expect(windowed.orders.map((o) => o.id)).toEqual(['order-in']);
  });

  it('is a shallow clone — does not mutate the original state or its orders array', () => {
    const orders = [buildOrder({ id: 'order-1', createdAt: daysBefore(3) })];
    const state = buildState({ orders });
    const originalOrdersRef = state.orders;

    const windowed = windowedState(state, 7);

    expect(windowed).not.toBe(state);
    expect(state.orders).toBe(originalOrdersRef);
    expect(state.orders).toHaveLength(1);
  });

  it('preserves every other SeedState field unchanged', () => {
    const warehouses = [{ id: 'wh-1', name: 'Almacén 1' }];
    const gestores = [{ id: 'g1', name: 'Gestor Uno' }];
    const state = buildState({ warehouses, gestores, orders: [buildOrder({ createdAt: daysBefore(3) })] });

    const windowed = windowedState(state, 30);

    expect(windowed.warehouses).toBe(state.warehouses);
    expect(windowed.gestores).toBe(state.gestores);
    expect(windowed.generatedAt).toBe(state.generatedAt);
  });
});

describe('buildActiveOrdersByStateAndWarehouse', () => {
  it('returns exactly the 3 non-completed states, in order, excluding entregado/comision_pagada', () => {
    const warehouses = [{ id: 'wh-1', name: 'Almacén 1' }];
    const orders = [
      buildOrder({ id: 'o1', state: 'creado', warehouseId: 'wh-1' }),
      buildOrder({ id: 'o2', state: 'entregado', warehouseId: 'wh-1' }),
      buildOrder({ id: 'o3', state: 'comision_pagada', warehouseId: 'wh-1' }),
    ];
    const state = buildState({ warehouses, orders });

    const view = buildActiveOrdersByStateAndWarehouse(state);

    expect(view.groups.map((g) => g.state)).toEqual(['creado', 'verificado', 'transportando']);
  });

  it('zero-pads a (state, warehouse) pair with no matching orders, not omitted', () => {
    const warehouses = [
      { id: 'wh-1', name: 'Almacén 1' },
      { id: 'wh-2', name: 'Almacén 2' },
    ];
    const orders = [buildOrder({ id: 'o1', state: 'creado', warehouseId: 'wh-1' })];
    const state = buildState({ warehouses, orders });

    const view = buildActiveOrdersByStateAndWarehouse(state);

    const creadoGroup = view.groups.find((g) => g.state === 'creado')!;
    expect(creadoGroup.cells.find((c) => c.warehouseId === 'wh-2')!.count).toBe(0);
    const transportandoGroup = view.groups.find((g) => g.state === 'transportando')!;
    expect(transportandoGroup.cells.every((c) => c.count === 0)).toBe(true);
    expect(transportandoGroup.total).toBe(0);
  });

  it('sums per-warehouse counts into the group total', () => {
    const warehouses = [
      { id: 'wh-1', name: 'Almacén 1' },
      { id: 'wh-2', name: 'Almacén 2' },
    ];
    const orders = [
      buildOrder({ id: 'o1', state: 'verificado', warehouseId: 'wh-1' }),
      buildOrder({ id: 'o2', state: 'verificado', warehouseId: 'wh-2' }),
      buildOrder({ id: 'o3', state: 'verificado', warehouseId: 'wh-2' }),
    ];
    const state = buildState({ warehouses, orders });

    const view = buildActiveOrdersByStateAndWarehouse(state);

    const verificadoGroup = view.groups.find((g) => g.state === 'verificado')!;
    expect(verificadoGroup.total).toBe(3);
    expect(verificadoGroup.cells.find((c) => c.warehouseId === 'wh-1')!.count).toBe(1);
    expect(verificadoGroup.cells.find((c) => c.warehouseId === 'wh-2')!.count).toBe(2);
  });
});

describe('buildTransportistaCapacity', () => {
  it('classifies a transportista with an active transportando order as ocupado', () => {
    const transportistas = [{ id: 't1', name: 'Transportista Uno' }];
    const orders = [buildOrder({ id: 'o1', state: 'transportando', transportistaId: 't1' })];
    const state = buildState({ transportistas, orders });

    const view = buildTransportistaCapacity(state);

    const row = view.rows.find((r) => r.transportistaId === 't1')!;
    expect(row.ocupado).toBe(true);
    expect(row.ordersTransportando).toBe(1);
    expect(view.transportando).toBe(1);
    expect(view.disponibles).toBe(0);
  });

  it('classifies a transportista with zero transportando orders as disponible', () => {
    const transportistas = [{ id: 't1', name: 'Transportista Uno' }];
    const state = buildState({ transportistas, orders: [] });

    const view = buildTransportistaCapacity(state);

    const row = view.rows.find((r) => r.transportistaId === 't1')!;
    expect(row.ocupado).toBe(false);
    expect(view.disponibles).toBe(1);
    expect(view.transportando).toBe(0);
  });

  it('counts "Sin chofer" as verificado orders with no transportistaId, independent of ocupado/disponible', () => {
    const orders = [
      buildOrder({ id: 'o1', state: 'verificado', transportistaId: undefined }),
      buildOrder({ id: 'o2', state: 'verificado', transportistaId: undefined }),
      buildOrder({ id: 'o3', state: 'verificado', transportistaId: 't1' }),
    ];
    const state = buildState({ transportistas: [], orders });

    const view = buildTransportistaCapacity(state);

    expect(view.sinChofer).toBe(2);
  });
});

describe('buildComisionesPorPagar', () => {
  it('sums pending MN across verificado/transportando/entregado, excluding paid and creado', () => {
    const orders = [
      buildOrder({ id: 'o1', state: 'verificado', commissionMN: 1000, commissionPaidAt: undefined }),
      buildOrder({ id: 'o2', state: 'entregado', commissionMN: 2000, commissionPaidAt: undefined, deliveredAt: daysBefore(1) }),
      buildOrder({ id: 'o3', state: 'comision_pagada', commissionMN: 3000, commissionPaidAt: daysBefore(1) }),
      buildOrder({ id: 'o4', state: 'creado', commissionMN: 500, commissionPaidAt: undefined }),
    ];
    const state = buildState({ orders });

    const view = buildComisionesPorPagar(state);

    expect(view.totalPendienteMN).toBe(3000);
  });

  it("measures días de atraso from deliveredAt, anchored to generatedAt, independent of wall-clock", () => {
    const gestores = [{ id: 'g1', name: 'Gestor Uno' }];
    const orders = [
      buildOrder({
        id: 'o1',
        state: 'entregado',
        gestorId: 'g1',
        deliveredAt: daysBefore(9),
        commissionPaidAt: undefined,
      }),
    ];
    const state = buildState({ gestores, orders });

    const view = buildComisionesPorPagar(state);

    const row = view.rows.find((r) => r.gestorId === 'g1')!;
    expect(row.diasAtraso).toBe(9);
  });

  it("appears at most once per gestor, using their most-overdue unpaid entregado order", () => {
    const gestores = [{ id: 'g1', name: 'Gestor Uno' }];
    const orders = [
      buildOrder({
        id: 'o-recent',
        state: 'entregado',
        gestorId: 'g1',
        deliveredAt: daysBefore(3),
        commissionMN: 100,
        commissionPaidAt: undefined,
      }),
      buildOrder({
        id: 'o-old',
        state: 'entregado',
        gestorId: 'g1',
        deliveredAt: daysBefore(9),
        commissionMN: 200,
        commissionPaidAt: undefined,
      }),
    ];
    const state = buildState({ gestores, orders });

    const view = buildComisionesPorPagar(state);

    const rows = view.rows.filter((r) => r.gestorId === 'g1');
    expect(rows).toHaveLength(1);
    expect(rows[0].diasAtraso).toBe(9);
    expect(rows[0].comisionMN).toBe(200);
  });

  it('excludes a gestor whose pending orders are all verificado/transportando (not yet entregado)', () => {
    const gestores = [{ id: 'g1', name: 'Gestor Uno' }];
    const orders = [
      buildOrder({ id: 'o1', state: 'verificado', gestorId: 'g1', commissionPaidAt: undefined }),
      buildOrder({ id: 'o2', state: 'transportando', gestorId: 'g1', commissionPaidAt: undefined }),
    ];
    const state = buildState({ gestores, orders });

    const view = buildComisionesPorPagar(state);

    expect(view.rows.find((r) => r.gestorId === 'g1')).toBeUndefined();
  });

  it("totalPendienteMN per row sums ALL of that gestor's pending orders, not just the overdue one", () => {
    const gestores = [{ id: 'g1', name: 'Gestor Uno' }];
    const orders = [
      buildOrder({
        id: 'o-entregado',
        state: 'entregado',
        gestorId: 'g1',
        commissionMN: 500,
        deliveredAt: daysBefore(9),
        commissionPaidAt: undefined,
      }),
      buildOrder({ id: 'o-verificado', state: 'verificado', gestorId: 'g1', commissionMN: 300, commissionPaidAt: undefined }),
    ];
    const state = buildState({ gestores, orders });

    const view = buildComisionesPorPagar(state);

    const row = view.rows.find((r) => r.gestorId === 'g1')!;
    expect(row.totalPendienteMN).toBe(800);
  });

  it('sorts rows descending by días de atraso', () => {
    const gestores = [
      { id: 'g1', name: 'Gestor Uno' },
      { id: 'g2', name: 'Gestor Dos' },
    ];
    const orders = [
      buildOrder({ id: 'o1', state: 'entregado', gestorId: 'g1', deliveredAt: daysBefore(3), commissionPaidAt: undefined }),
      buildOrder({ id: 'o2', state: 'entregado', gestorId: 'g2', deliveredAt: daysBefore(9), commissionPaidAt: undefined }),
    ];
    const state = buildState({ gestores, orders });

    const view = buildComisionesPorPagar(state);

    expect(view.rows.map((r) => r.gestorId)).toEqual(['g2', 'g1']);
  });
});

describe('buildPedidosDemorados', () => {
  it('flags an order older than its stage threshold as demorado', () => {
    const orders = [
      buildOrder({
        id: 'o1',
        state: 'verificado',
        verifiedAt: daysBefore(STAGE_DELAY_THRESHOLD_DAYS.verificado + 1),
      }),
    ];
    const state = buildState({ orders });

    const view = buildPedidosDemorados(state);

    expect(view.rows.map((r) => r.orderId)).toContain('o1');
    const row = view.rows.find((r) => r.orderId === 'o1')!;
    expect(row.stage).toBe('verificado');
    expect(row.diasEnEtapa).toBe(STAGE_DELAY_THRESHOLD_DAYS.verificado + 1);
    expect(row.thresholdDays).toBe(STAGE_DELAY_THRESHOLD_DAYS.verificado);
  });

  it('does not flag an order within its stage threshold', () => {
    const orders = [
      buildOrder({
        id: 'o1',
        state: 'transportando',
        transportingAt: daysBefore(STAGE_DELAY_THRESHOLD_DAYS.transportando - 1),
      }),
    ];
    const state = buildState({ orders });

    const view = buildPedidosDemorados(state);

    expect(view.rows.find((r) => r.orderId === 'o1')).toBeUndefined();
  });

  it('never evaluates entregado or comision_pagada orders, however old', () => {
    const orders = [
      buildOrder({ id: 'o1', state: 'entregado', createdAt: daysBefore(100), deliveredAt: daysBefore(50) }),
      buildOrder({ id: 'o2', state: 'comision_pagada', createdAt: daysBefore(100) }),
    ];
    const state = buildState({ orders });

    const view = buildPedidosDemorados(state);

    expect(view.rows).toHaveLength(0);
  });

  it('anchors stage age to generatedAt, not the wall-clock date', () => {
    const oldGeneratedAt = '2020-01-10T12:00:00.000Z';
    const createdAt = new Date(
      new Date(oldGeneratedAt).getTime() - (STAGE_DELAY_THRESHOLD_DAYS.creado + 1) * DAY_MS,
    ).toISOString();
    const state = buildState({
      generatedAt: oldGeneratedAt,
      orders: [buildOrder({ id: 'o1', state: 'creado', createdAt })],
    });

    const view = buildPedidosDemorados(state);

    expect(view.rows.map((r) => r.orderId)).toContain('o1');
  });

  it('excludes a verificado order missing verifiedAt from the stage-age calculation', () => {
    const orders = [buildOrder({ id: 'o1', state: 'verificado', verifiedAt: undefined, createdAt: daysBefore(30) })];
    const state = buildState({ orders });

    const view = buildPedidosDemorados(state);

    expect(view.rows.find((r) => r.orderId === 'o1')).toBeUndefined();
  });

  it('sorts rows descending by días en etapa', () => {
    const orders = [
      buildOrder({ id: 'o1', state: 'creado', createdAt: daysBefore(STAGE_DELAY_THRESHOLD_DAYS.creado + 1) }),
      buildOrder({ id: 'o2', state: 'creado', createdAt: daysBefore(STAGE_DELAY_THRESHOLD_DAYS.creado + 5) }),
    ];
    const state = buildState({ orders });

    const view = buildPedidosDemorados(state);

    expect(view.rows.map((r) => r.orderId)).toEqual(['o2', 'o1']);
  });
});

describe('buildDecisionesDashboard', () => {
  it('hasData is false when all orders are creado', () => {
    const state = buildState({ orders: [buildOrder({ id: 'order-1', state: 'creado' })] });

    const view = buildDecisionesDashboard(state);

    expect(view.hasData).toBe(false);
  });

  it('hasData is true when at least one order is verificado or later', () => {
    const state = buildState({ orders: [buildOrder({ id: 'order-1', state: 'verificado' })] });

    const view = buildDecisionesDashboard(state);

    expect(view.hasData).toBe(true);
  });

  it('composes all sub-view models into a single DashboardView without throwing on an empty seed', () => {
    const state = buildState();

    expect(() => buildDecisionesDashboard(state)).not.toThrow();
    const view = buildDecisionesDashboard(state);

    expect(view.kpis).toBeDefined();
    expect(view.salesTrend.points).toHaveLength(20);
    expect(view.stages.rows).toHaveLength(5);
    expect(view.warehouses.rows).toEqual([]);
    expect(view.currencyMix.buckets).toEqual([]);
    expect(view.gestores.rows).toEqual([]);
    expect(view.inventoryAlerts.groups).toEqual([]);
  });
});
