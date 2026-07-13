import { DAY_MS } from '../seed/constants';
import { buildFinanceSummary, type FinanceStateRow } from './finanzas';
import { buildKpiTrend, splitByPeriod, type KpiTrend } from './period-trend';
import type { Order, OrderState, SeedState, SeededProduct } from './types';

/**
 * Domain view-model builder for the `/finanzas` dashboard. Pure — numbers
 * only, no formatting, no I/O. USER-LOCKED: this module is self-contained —
 * it composes finance's OWN `buildFinanceSummary` (unchanged) plus finance's
 * OWN pure sub-helpers below, each independently exported for isolated unit
 * testing. It NEVER imports from `decisiones-dashboard.ts` or any
 * `components/decisiones/*` — every "reused-but-refinanced" datum
 * (currency mix, gestor ranking, warehouse sales, sales trend) is recomputed
 * here from a genuinely financial angle instead.
 *
 * Period windows anchor to `state.generatedAt` (the frozen seed timestamp)
 * via the neutral `period-trend.ts` module, NEVER `Date.now()`. Every
 * MN↔USD conversion uses the order's OWN frozen
 * `exchangeRateSnapshot.usdToMn`, never the live `state.exchangeRates`.
 */

// ---- private per-order helpers (finance owns its own copy — not imported from decisiones) --------

const PENDING_COMMISSION_STATES: OrderState[] = ['verificado', 'transportando', 'entregado'];
const COBRADO_STATES: OrderState[] = ['entregado', 'comision_pagada'];
const PENDIENTE_STATES: OrderState[] = ['verificado', 'transportando'];

function qualifying(orders: Order[]): Order[] {
  return orders.filter((order) => order.state !== 'creado');
}

function isCommissionPending(order: Order): boolean {
  return order.commissionPaidAt == null && PENDING_COMMISSION_STATES.includes(order.state);
}

function sumUSD(orders: Order[]): number {
  return orders.reduce((sum, order) => sum + order.totalUSD, 0);
}

function sumMN(orders: Order[]): number {
  return orders.reduce((sum, order) => sum + (order.totalMN ?? 0), 0);
}

function sumCommissionMN(orders: Order[]): number {
  return orders.reduce((sum, order) => sum + (order.commissionMN ?? 0), 0);
}

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

export interface FinanceKpiHeaderView {
  ingresosFacturadosUSD: KpiTrend;
  ingresosLiquidadosMN: KpiTrend;
  cobradoUSD: KpiTrend;
  pendienteUSD: KpiTrend;
  comisionPendienteMN: KpiTrend;
  margenNetoUSD: KpiTrend;
  /** current-window margenNetoUSD / ingresosFacturadosUSD * 100, or 0 when revenue is 0. */
  margenPercent: number;
}

/**
 * Builds the 5 windowed KPI tiles (current 10-day window vs prior 10-day
 * window, anchored to `state.generatedAt`). "Comisión pendiente" mirrors
 * `buildFinanceSummary`'s own pending definition (unpaid AND in
 * verificado/transportando/entregado) applied within each window — it does
 * NOT read the all-time `buildFinanceSummary(state).kpis.commissionPendingMN`
 * directly, since that figure isn't split by period.
 */
export function buildFinanceKpiHeader(state: SeedState): FinanceKpiHeaderView {
  const productById = new Map(state.products.map((product) => [product.id, product]));
  const { current, prior } = splitByPeriod(state);

  const currentQ = qualifying(current);
  const priorQ = qualifying(prior);

  const facturadoCurrent = sumUSD(currentQ);
  const facturadoPrior = sumUSD(priorQ);

  const liquidadoCurrent = sumMN(currentQ);
  const liquidadoPrior = sumMN(priorQ);

  const cobradoCurrent = sumUSD(current.filter((order) => COBRADO_STATES.includes(order.state)));
  const cobradoPrior = sumUSD(prior.filter((order) => COBRADO_STATES.includes(order.state)));

  const pendienteCurrent = sumUSD(current.filter((order) => PENDIENTE_STATES.includes(order.state)));
  const pendientePrior = sumUSD(prior.filter((order) => PENDIENTE_STATES.includes(order.state)));

  const comisionCurrent = sumCommissionMN(current.filter(isCommissionPending));
  const comisionPrior = sumCommissionMN(prior.filter(isCommissionPending));

  const margenCurrent = currentQ.reduce((sum, order) => sum + orderMarginUSD(order, productById), 0);
  const margenPrior = priorQ.reduce((sum, order) => sum + orderMarginUSD(order, productById), 0);

  return {
    ingresosFacturadosUSD: buildKpiTrend(facturadoCurrent, facturadoPrior),
    ingresosLiquidadosMN: buildKpiTrend(liquidadoCurrent, liquidadoPrior),
    cobradoUSD: buildKpiTrend(cobradoCurrent, cobradoPrior),
    pendienteUSD: buildKpiTrend(pendienteCurrent, pendientePrior),
    comisionPendienteMN: buildKpiTrend(comisionCurrent, comisionPrior),
    margenNetoUSD: buildKpiTrend(margenCurrent, margenPrior),
    margenPercent: facturadoCurrent > 0 ? (margenCurrent / facturadoCurrent) * 100 : 0,
  };
}

// ---- cash-flow trend (Layer 2a) -----------------------------------------------------

export interface CashFlowTrendPoint {
  /** 0 = the anchor day (newest), 19 = oldest day in the 20-day window. */
  dayOffset: number;
  cobradoUSD: number;
  pendienteUSD: number;
}

export interface CashFlowTrendView {
  /** Ordered oldest -> newest (dayOffset 19 .. 0). */
  points: CashFlowTrendPoint[];
}

/**
 * Buckets qualifying orders (`state !== 'creado'`) by calendar day over the
 * 20-day window ending at `state.generatedAt`, split into cobrado (state
 * proxy) vs pendiente (state proxy) USD. Every day appears — including days
 * with zero qualifying orders, at `{cobradoUSD:0, pendienteUSD:0}` — never
 * omitted. Mirrors `buildSalesTrend`'s bucketing shape.
 */
export function buildCashFlowTrend(state: SeedState): CashFlowTrendView {
  const anchorMs = new Date(state.generatedAt).getTime();
  const buckets = new Map<number, { cobradoUSD: number; pendienteUSD: number }>();
  for (let offset = 0; offset < 20; offset++) {
    buckets.set(offset, { cobradoUSD: 0, pendienteUSD: 0 });
  }

  for (const order of state.orders) {
    if (order.state === 'creado') continue;
    const createdMs = new Date(order.createdAt).getTime();
    const diff = anchorMs - createdMs;
    if (diff < 0) continue;
    const offset = Math.floor(diff / DAY_MS);
    const bucket = buckets.get(offset);
    if (!bucket) continue; // outside the 20-day window
    if (COBRADO_STATES.includes(order.state)) {
      bucket.cobradoUSD += order.totalUSD;
    } else if (PENDIENTE_STATES.includes(order.state)) {
      bucket.pendienteUSD += order.totalUSD;
    }
  }

  const points: CashFlowTrendPoint[] = [];
  for (let offset = 19; offset >= 0; offset--) {
    const bucket = buckets.get(offset)!;
    points.push({ dayOffset: offset, cobradoUSD: bucket.cobradoUSD, pendienteUSD: bucket.pendienteUSD });
  }

  return { points };
}

// ---- currency exposure (Layer 2d) ---------------------------------------------------

export type CurrencyBucketKey = 'USD' | 'MN' | 'ZELLE' | 'EUR' | 'otros';

const KNOWN_METHODS: CurrencyBucketKey[] = ['USD', 'MN', 'ZELLE', 'EUR'];
const HARD_CURRENCY_METHODS: CurrencyBucketKey[] = ['USD', 'ZELLE', 'EUR'];

export interface CurrencyExposureSlice {
  method: CurrencyBucketKey;
  revenueUSD: number;
  /** Percentage share of total qualifying revenueUSD. */
  percent: number;
  /** USD/ZELLE/EUR = true (hard currency); MN/otros = false (local, devaluing). */
  isHardCurrency: boolean;
}

export interface CurrencyExposureView {
  slices: CurrencyExposureSlice[];
}

/**
 * Groups qualifying orders by `payment.method` into revenue share — the
 * financial angle on currency mix: how exposed is revenue to FX/devaluation
 * risk. An unrecognized method is grouped into an explicit "otros" bucket
 * (treated as local/non-hard) rather than thrown away.
 */
export function buildCurrencyExposure(state: SeedState): CurrencyExposureView {
  const qualifyingOrders = qualifying(state.orders);
  const totals = new Map<CurrencyBucketKey, number>();

  for (const order of qualifyingOrders) {
    const raw = order.payment?.method;
    const key: CurrencyBucketKey = (KNOWN_METHODS as string[]).includes(raw) ? (raw as CurrencyBucketKey) : 'otros';
    totals.set(key, (totals.get(key) ?? 0) + order.totalUSD);
  }

  const totalRevenue = [...totals.values()].reduce((sum, value) => sum + value, 0);
  const slices: CurrencyExposureSlice[] = [...totals.entries()].map(([method, revenueUSD]) => ({
    method,
    revenueUSD,
    percent: totalRevenue > 0 ? (revenueUSD / totalRevenue) * 100 : 0,
    isHardCurrency: (HARD_CURRENCY_METHODS as string[]).includes(method),
  }));

  const rank = (method: CurrencyBucketKey) => {
    const index = KNOWN_METHODS.indexOf(method);
    return index === -1 ? KNOWN_METHODS.length : index;
  };
  slices.sort((a, b) => rank(a.method) - rank(b.method));

  return { slices };
}

// ---- gestor commission cost (Layer 3a) ----------------------------------------------

export interface GestorCommissionCostRow {
  gestorId: string;
  name: string;
  revenueUSD: number;
  /** Σ commissionMN across ALL qualifying orders — frozen/earned regardless of paid status. */
  commissionEarnedMN: number;
  /** Σ commissionMN restricted to unpaid verificado/transportando/entregado. */
  commissionPendingMN: number;
  /** Derived: commissionEarnedMN - commissionPendingMN. */
  commissionPaidMN: number;
  /** Derived: (Σ orderCommissionUSD) / revenueUSD * 100, guarded against ÷0. */
  takeRatePercent: number;
  /** Derived: revenueUSD / (Σ orderCommissionUSD), guarded against ÷0. */
  roi: number;
}

export interface GestorCommissionCostView {
  rows: GestorCommissionCostRow[];
}

/**
 * One row per `state.gestores` entry (all-time qualifying orders) — the
 * financial angle on gestor ranking: commission COST, take-rate, ROI, and
 * outstanding liability owed, rather than sales performance. A gestor with
 * zero orders still appears with all values at 0 (÷0 guarded), sorted desc
 * by revenueUSD.
 */
export function buildGestorCommissionCost(state: SeedState): GestorCommissionCostView {
  const qualifyingOrders = qualifying(state.orders);
  const rows = state.gestores.map((gestor) => {
    const orders = qualifyingOrders.filter((order) => order.gestorId === gestor.id);
    const revenueUSD = sumUSD(orders);
    const commissionEarnedMN = sumCommissionMN(orders);
    const commissionPendingMN = sumCommissionMN(orders.filter(isCommissionPending));
    const commissionPaidMN = commissionEarnedMN - commissionPendingMN;
    const commissionEarnedUSD = orders.reduce((sum, order) => sum + orderCommissionUSD(order), 0);
    const takeRatePercent = revenueUSD > 0 ? (commissionEarnedUSD / revenueUSD) * 100 : 0;
    const roi = commissionEarnedUSD > 0 ? revenueUSD / commissionEarnedUSD : 0;
    return {
      gestorId: gestor.id,
      name: gestor.name,
      revenueUSD,
      commissionEarnedMN,
      commissionPendingMN,
      commissionPaidMN,
      takeRatePercent,
      roi,
    };
  });
  rows.sort((a, b) => b.revenueUSD - a.revenueUSD);
  return { rows };
}

// ---- warehouse cash flow (Layer 3b) -------------------------------------------------

export interface WarehouseCashFlowRow {
  warehouseId: string;
  warehouseName: string;
  cobradoUSD: number;
  pendienteUSD: number;
}

export interface WarehouseCashFlowView {
  rows: WarehouseCashFlowRow[];
}

/**
 * One row per `state.warehouses` entry (all-time qualifying orders) — the
 * financial angle on warehouse sales: uncollected cash trapped per
 * warehouse (cobrado/pendiente), not sales volume. A warehouse with zero
 * qualifying orders still appears at 0, never omitted. Sorted desc by
 * (cobradoUSD + pendienteUSD).
 */
export function buildWarehouseCashFlow(state: SeedState): WarehouseCashFlowView {
  const qualifyingOrders = qualifying(state.orders);
  const rows = state.warehouses.map((warehouse) => {
    const orders = qualifyingOrders.filter((order) => order.warehouseId === warehouse.id);
    const cobradoUSD = sumUSD(orders.filter((order) => COBRADO_STATES.includes(order.state)));
    const pendienteUSD = sumUSD(orders.filter((order) => PENDIENTE_STATES.includes(order.state)));
    return { warehouseId: warehouse.id, warehouseName: warehouse.name, cobradoUSD, pendienteUSD };
  });
  rows.sort((a, b) => b.cobradoUSD + b.pendienteUSD - (a.cobradoUSD + a.pendienteUSD));
  return { rows };
}

// ---- orchestrator ----------------------------------------------------------------------

export interface CommissionLiabilityView {
  paidMN: number;
  pendingMN: number;
}

export interface RevenueByStateView {
  rows: FinanceStateRow[];
}

export interface FinanceDashboardView {
  hasData: boolean;
  kpis: FinanceKpiHeaderView;
  cashFlowTrend: CashFlowTrendView;
  commissionLiability: CommissionLiabilityView;
  revenueByState: RevenueByStateView;
  currencyExposure: CurrencyExposureView;
  gestorCommission: GestorCommissionCostView;
  warehouseCashFlow: WarehouseCashFlowView;
  /** Reuses `buildFinanceSummary`'s rows unchanged (Layer 3c drill-down). */
  stateBreakdown: FinanceStateRow[];
}

/**
 * Composes every sub-helper above into a single typed view model, plus
 * `buildFinanceSummary` (UNCHANGED — never mutated) for commission liability
 * and per-state revenue. `hasData` is `false` only when every order is
 * `creado` (or the seed is empty) — the container renders the empty-state
 * instead of the 3 layers.
 */
export function buildFinanceDashboard(state: SeedState): FinanceDashboardView {
  const hasData = state.orders.some((order) => order.state !== 'creado');
  const summary = buildFinanceSummary(state);

  return {
    hasData,
    kpis: buildFinanceKpiHeader(state),
    cashFlowTrend: buildCashFlowTrend(state),
    commissionLiability: {
      paidMN: summary.kpis.commissionPaidMN,
      pendingMN: summary.kpis.commissionPendingMN,
    },
    revenueByState: { rows: summary.rows },
    currencyExposure: buildCurrencyExposure(state),
    gestorCommission: buildGestorCommissionCost(state),
    warehouseCashFlow: buildWarehouseCashFlow(state),
    stateBreakdown: summary.rows,
  };
}
