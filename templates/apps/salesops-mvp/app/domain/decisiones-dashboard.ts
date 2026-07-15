import { buildInventorySummary } from './inventory';
import { buildKpiTrend, splitByPeriod } from './period-trend';
import type { KpiTrend, PeriodSplit, Trend } from './period-trend';
import { DAY_MS } from '../seed/constants';
import type { Order, OrderState, SeedState, SeededProduct } from './types';

/**
 * Domain view-model builder for the `/decisiones` dashboard. Pure — numbers
 * only, no formatting, no I/O. Every helper below is independently exported
 * for isolated unit testing and composed by `buildDecisionesDashboard`.
 *
 * Period windows anchor to `state.generatedAt` (the frozen seed timestamp),
 * NEVER `Date.now()` — see `splitByPeriod`. Every MN↔USD conversion uses the
 * order's OWN frozen `exchangeRateSnapshot.usdToMn`, never the live
 * `state.exchangeRates`.
 *
 * Generic time/ratio math (`Trend`/`KpiTrend`/`PeriodSplit`,
 * `splitByPeriod`/`buildKpiTrend`/`computeTrend`/`computeDelta`) now lives in
 * the neutral `period-trend.ts` module — re-exported here so existing
 * importers and tests keep their import path.
 */

export type { Trend, KpiTrend, PeriodSplit };
export { splitByPeriod };

// ---- per-order cost/commission helpers --------

function orderCostUSD(order: Order, productById: Map<string, SeededProduct>): number {
  let cost = 0;
  for (const item of order.items) {
    const product = productById.get(item.productId);
    if (!product) continue; // orphan skip — no matching product
    cost += item.quantity * product.costUSD;
  }
  return cost;
}

function orderCommissionUSD(order: Order): number {
  const usdToMn = order.exchangeRateSnapshot?.usdToMn ?? 0;
  const commissionMN = order.commissionMN ?? 0;
  return usdToMn > 0 ? commissionMN / usdToMn : 0;
}

function orderMarginUSD(order: Order, productById: Map<string, SeededProduct>): number {
  return order.totalUSD - orderCostUSD(order, productById) - orderCommissionUSD(order);
}

// ---- KPI header (Layer 1) ----------------------------------------------------------

export interface KpiHeaderView {
  ventasUSD: KpiTrend;
  margenUSD: KpiTrend;
  /** current-window marginUSD / revenueUSD * 100, or 0 when revenue is 0. */
  margenPercent: number;
  pedidos: KpiTrend;
  comisionPendienteMN: KpiTrend;
}

/** Same "pending" definition as `buildFinanceSummary`: unpaid AND in verificado/transportando/entregado. */
const PENDING_COMMISSION_STATES: OrderState[] = ['verificado', 'transportando', 'entregado'];

function isCommissionPending(order: Order): boolean {
  return order.commissionPaidAt == null && PENDING_COMMISSION_STATES.includes(order.state);
}

function qualifying(orders: Order[]): Order[] {
  return orders.filter((order) => order.state !== 'creado');
}

function sumUSD(orders: Order[]): number {
  return orders.reduce((sum, order) => sum + order.totalUSD, 0);
}

function sumCommissionMN(orders: Order[]): number {
  return orders.reduce((sum, order) => sum + (order.commissionMN ?? 0), 0);
}

/**
 * Builds all 4 KPI tiles, each with a current-window value and a
 * prior-window value (10 days vs prior 10 days, anchored to
 * `state.generatedAt`). Ventas/Margen/Pedidos use only orders with
 * `state !== 'creado'`; Comisión pendiente uses its own state-based
 * grouping within each window (mirrors `buildFinanceSummary`).
 */
export function buildKpiHeader(state: SeedState): KpiHeaderView {
  const productById = new Map(state.products.map((product) => [product.id, product]));
  const { current, prior } = splitByPeriod(state);

  const currentQ = qualifying(current);
  const priorQ = qualifying(prior);

  const ventasCurrent = sumUSD(currentQ);
  const ventasPrior = sumUSD(priorQ);

  const margenCurrent = currentQ.reduce((sum, order) => sum + orderMarginUSD(order, productById), 0);
  const margenPrior = priorQ.reduce((sum, order) => sum + orderMarginUSD(order, productById), 0);

  const pedidosCurrent = currentQ.length;
  const pedidosPrior = priorQ.length;

  const comisionCurrent = sumCommissionMN(current.filter(isCommissionPending));
  const comisionPrior = sumCommissionMN(prior.filter(isCommissionPending));

  return {
    ventasUSD: buildKpiTrend(ventasCurrent, ventasPrior),
    margenUSD: buildKpiTrend(margenCurrent, margenPrior),
    margenPercent: ventasCurrent > 0 ? (margenCurrent / ventasCurrent) * 100 : 0,
    pedidos: buildKpiTrend(pedidosCurrent, pedidosPrior),
    comisionPendienteMN: buildKpiTrend(comisionCurrent, comisionPrior),
  };
}

// ---- sales trend (Layer 2a) ---------------------------------------------------------

export interface SalesTrendPoint {
  /** 0 = the anchor day (newest), 19 = oldest day in the 20-day window. */
  dayOffset: number;
  count: number;
  valueUSD: number;
}

export interface SalesTrendView {
  /** Ordered oldest -> newest (dayOffset 19 .. 0). */
  points: SalesTrendPoint[];
}

/**
 * Buckets qualifying orders (`state !== 'creado'`) by calendar day over the
 * 20-day window ending at `state.generatedAt`. Every day appears — including
 * days with zero qualifying orders, at `{count:0, valueUSD:0}` — never omitted.
 */
export function buildSalesTrend(state: SeedState): SalesTrendView {
  const anchorMs = new Date(state.generatedAt).getTime();
  const buckets = new Map<number, { count: number; valueUSD: number }>();
  for (let offset = 0; offset < 20; offset++) {
    buckets.set(offset, { count: 0, valueUSD: 0 });
  }

  for (const order of state.orders) {
    if (order.state === 'creado') continue;
    const createdMs = new Date(order.createdAt).getTime();
    const diff = anchorMs - createdMs;
    if (diff < 0) continue;
    const offset = Math.floor(diff / DAY_MS);
    const bucket = buckets.get(offset);
    if (!bucket) continue; // outside the 20-day window
    bucket.count += 1;
    bucket.valueUSD += order.totalUSD;
  }

  const points: SalesTrendPoint[] = [];
  for (let offset = 19; offset >= 0; offset--) {
    const bucket = buckets.get(offset)!;
    points.push({ dayOffset: offset, count: bucket.count, valueUSD: bucket.valueUSD });
  }

  return { points };
}

// ---- stage distribution (Layer 2b) --------------------------------------------------

export interface StageDistributionRow {
  state: OrderState;
  label: string;
  count: number;
}

export interface StageDistributionView {
  rows: StageDistributionRow[];
}

const STAGE_LABELS: Record<OrderState, string> = {
  creado: 'Creado',
  verificado: 'Verificado',
  transportando: 'Transportando',
  entregado: 'Entregado',
  comision_pagada: 'Comisión pagada',
};

const STAGE_ORDER: OrderState[] = ['creado', 'verificado', 'transportando', 'entregado', 'comision_pagada'];

/**
 * Snapshot distribution — NOT a conversion funnel. Counts EVERY order
 * (including `creado`, unlike every other aggregation here) into exactly one
 * row per `OrderState`, fixed linear order, zero-count states included.
 */
export function buildStageDistribution(state: SeedState): StageDistributionView {
  const rows = STAGE_ORDER.map((stageState) => ({
    state: stageState,
    label: STAGE_LABELS[stageState],
    count: state.orders.filter((order) => order.state === stageState).length,
  }));
  return { rows };
}

// ---- warehouse sales (Layer 2c) -----------------------------------------------------

export interface WarehouseSalesRow {
  warehouseId: string;
  warehouseName: string;
  revenueUSD: number;
  count: number;
}

export interface WarehouseSalesView {
  rows: WarehouseSalesRow[];
}

/**
 * One row per `state.warehouses` entry (all-time qualifying orders, not
 * window-split), sorted desc by revenueUSD. A warehouse with zero qualifying
 * orders still appears with `revenueUSD:0, count:0`, never omitted.
 */
export function buildWarehouseSales(state: SeedState): WarehouseSalesView {
  const qualifyingOrders = qualifying(state.orders);
  const rows = state.warehouses.map((warehouse) => {
    const orders = qualifyingOrders.filter((order) => order.warehouseId === warehouse.id);
    return {
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      revenueUSD: sumUSD(orders),
      count: orders.length,
    };
  });
  rows.sort((a, b) => b.revenueUSD - a.revenueUSD);
  return { rows };
}

// ---- currency mix (Layer 2d) ---------------------------------------------------------

export type CurrencyBucketKey = 'USD' | 'MN' | 'ZELLE' | 'EUR' | 'otros';

const KNOWN_METHODS: CurrencyBucketKey[] = ['USD', 'MN', 'ZELLE', 'EUR'];

export interface CurrencyMixBucket {
  method: CurrencyBucketKey;
  count: number;
  revenueUSD: number;
  /** Percentage share of the total qualifying order count. */
  percent: number;
}

export interface CurrencyMixView {
  buckets: CurrencyMixBucket[];
}

/**
 * Groups qualifying orders by `payment.method`. Only buckets present in the
 * data appear (not zero-padded, unlike warehouse/gestor). An unrecognized
 * method is grouped into an explicit "otros" bucket rather than thrown away.
 */
export function buildCurrencyMix(state: SeedState): CurrencyMixView {
  const qualifyingOrders = qualifying(state.orders);
  const totals = new Map<CurrencyBucketKey, { count: number; revenueUSD: number }>();

  for (const order of qualifyingOrders) {
    const raw = order.payment?.method;
    const key: CurrencyBucketKey = (KNOWN_METHODS as string[]).includes(raw) ? (raw as CurrencyBucketKey) : 'otros';
    const bucket = totals.get(key) ?? { count: 0, revenueUSD: 0 };
    bucket.count += 1;
    bucket.revenueUSD += order.totalUSD;
    totals.set(key, bucket);
  }

  const totalCount = qualifyingOrders.length;
  const buckets: CurrencyMixBucket[] = [...totals.entries()].map(([method, value]) => ({
    method,
    count: value.count,
    revenueUSD: value.revenueUSD,
    percent: totalCount > 0 ? (value.count / totalCount) * 100 : 0,
  }));

  const rank = (method: CurrencyBucketKey) => {
    const index = KNOWN_METHODS.indexOf(method);
    return index === -1 ? KNOWN_METHODS.length : index;
  };
  buckets.sort((a, b) => rank(a.method) - rank(b.method));

  return { buckets };
}

// ---- gestor ranking (Layer 3a) --------------------------------------------------------

export interface GestorRankingRow {
  gestorId: string;
  name: string;
  revenueUSD: number;
  count: number;
  aovUSD: number;
  /** Σ commissionMN across ALL qualifying orders — frozen/earned at verification, regardless of paid status. */
  commissionEarnedMN: number;
  /** Σ commissionMN restricted to unpaid verificado/transportando/entregado — same pending definition as buildFinanceSummary. */
  commissionPendingMN: number;
}

export interface GestorRankingView {
  rows: GestorRankingRow[];
}

/**
 * One row per `state.gestores` entry (all-time qualifying orders), sorted
 * desc by revenueUSD. A gestor with zero qualifying orders still appears
 * with all values at 0, never omitted.
 */
export function buildGestorRanking(state: SeedState): GestorRankingView {
  const qualifyingOrders = qualifying(state.orders);
  const rows = state.gestores.map((gestor) => {
    const orders = qualifyingOrders.filter((order) => order.gestorId === gestor.id);
    const revenueUSD = sumUSD(orders);
    const count = orders.length;
    const aovUSD = count > 0 ? revenueUSD / count : 0;
    const commissionEarnedMN = sumCommissionMN(orders);
    const commissionPendingMN = sumCommissionMN(orders.filter(isCommissionPending));
    return { gestorId: gestor.id, name: gestor.name, revenueUSD, count, aovUSD, commissionEarnedMN, commissionPendingMN };
  });
  rows.sort((a, b) => b.revenueUSD - a.revenueUSD);
  return { rows };
}

// ---- inventory alerts (Layer 3b) ------------------------------------------------------

export type StockAlertLevel = 'agotado' | 'bajo';

export interface InventoryAlertRow {
  productId: string;
  name: string;
  quantity: number;
  level: StockAlertLevel;
}

export interface InventoryAlertGroup {
  warehouseId: string;
  warehouseName: string;
  rows: InventoryAlertRow[];
}

export interface InventoryAlertsView {
  groups: InventoryAlertGroup[];
}

function classifyStock(quantity: number): StockAlertLevel | 'normal' {
  if (quantity === 0) return 'agotado';
  if (quantity <= 3) return 'bajo';
  return 'normal';
}

/**
 * Reuses `buildInventorySummary` (which already joins product + skips orphan
 * `productId` entries without throwing) and reclassifies each row's quantity
 * into agotado (0) / bajo (1-3) / normal (4+). Only agotado/bajo rows are
 * kept, grouped by warehouseId; a warehouse with no alert rows is omitted.
 */
export function buildInventoryAlerts(state: SeedState): InventoryAlertsView {
  const summary = buildInventorySummary(state);

  const groups: InventoryAlertGroup[] = summary.warehouses
    .map((warehouse) => ({
      warehouseId: warehouse.warehouseId,
      warehouseName: warehouse.warehouseName,
      rows: warehouse.rows
        .map((row) => ({
          productId: row.productId,
          name: row.name,
          quantity: row.quantity,
          level: classifyStock(row.quantity),
        }))
        .filter((row): row is InventoryAlertRow => row.level !== 'normal'),
    }))
    .filter((group) => group.rows.length > 0);

  return { groups };
}

// ---- orchestrator ----------------------------------------------------------------------

export interface DashboardView {
  hasData: boolean;
  kpis: KpiHeaderView;
  salesTrend: SalesTrendView;
  stages: StageDistributionView;
  warehouses: WarehouseSalesView;
  currencyMix: CurrencyMixView;
  gestores: GestorRankingView;
  inventoryAlerts: InventoryAlertsView;
}

/**
 * Composes every sub-helper above into a single typed view model.
 * `hasData` is `false` only when every order is `creado` (or the seed is
 * empty) — the container renders the empty-state instead of the 3 layers.
 */
export function buildDecisionesDashboard(state: SeedState): DashboardView {
  const hasData = state.orders.some((order) => order.state !== 'creado');

  return {
    hasData,
    kpis: buildKpiHeader(state),
    salesTrend: buildSalesTrend(state),
    stages: buildStageDistribution(state),
    warehouses: buildWarehouseSales(state),
    currencyMix: buildCurrencyMix(state),
    gestores: buildGestorRanking(state),
    inventoryAlerts: buildInventoryAlerts(state),
  };
}
