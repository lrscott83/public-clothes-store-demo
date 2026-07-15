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
  comisionPendienteMN: KpiTrend;
  margenNetoUSD: KpiTrend;
  /** current-window margenNetoUSD / ingresosFacturadosUSD * 100, or 0 when revenue is 0. */
  margenPercent: number;
  /** Appended last — see 5th-tile ordering. ingresosFacturadosUSD / pedidosCount, guarded on count, not revenue. */
  aovUSD: KpiTrend;
}

/**
 * Builds the 5 windowed KPI tiles (current 10-day window vs prior 10-day
 * window, anchored to `state.generatedAt`). "Comisión pendiente" mirrors
 * `buildFinanceSummary`'s own pending definition (unpaid AND in
 * verificado/transportando/entregado) applied within each window — it does
 * NOT read the all-time `buildFinanceSummary(state).kpis.commissionPendingMN`
 * directly, since that figure isn't split by period. `aovUSD` (Ticket
 * promedio) is appended last, count-guarded on `pedidosCurrent`/`pedidosPrior`
 * (private locals — Finance surfaces no "Pedidos" tile of its own).
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

  const comisionCurrent = sumCommissionMN(current.filter(isCommissionPending));
  const comisionPrior = sumCommissionMN(prior.filter(isCommissionPending));

  const margenCurrent = currentQ.reduce((sum, order) => sum + orderMarginUSD(order, productById), 0);
  const margenPrior = priorQ.reduce((sum, order) => sum + orderMarginUSD(order, productById), 0);

  const pedidosCurrent = currentQ.length;
  const pedidosPrior = priorQ.length;
  const aovCurrent = pedidosCurrent > 0 ? facturadoCurrent / pedidosCurrent : 0;
  const aovPrior = pedidosPrior > 0 ? facturadoPrior / pedidosPrior : 0;

  return {
    ingresosFacturadosUSD: buildKpiTrend(facturadoCurrent, facturadoPrior),
    ingresosLiquidadosMN: buildKpiTrend(liquidadoCurrent, liquidadoPrior),
    comisionPendienteMN: buildKpiTrend(comisionCurrent, comisionPrior),
    margenNetoUSD: buildKpiTrend(margenCurrent, margenPrior),
    margenPercent: facturadoCurrent > 0 ? (margenCurrent / facturadoCurrent) * 100 : 0,
    aovUSD: buildKpiTrend(aovCurrent, aovPrior),
  };
}

// ---- revenue trend (Layer 2a) -------------------------------------------------------

export interface RevenueTrendPoint {
  /** 0 = the anchor day (newest), 19 = oldest day in the 20-day window. */
  dayOffset: number;
  revenueUSD: number;
}

export interface RevenueTrendView {
  /** Ordered oldest -> newest (dayOffset 19 .. 0). */
  points: RevenueTrendPoint[];
}

/**
 * Buckets qualifying orders (`state !== 'creado'`) by calendar day over the
 * 20-day window ending at `state.generatedAt`, summing `totalUSD` per day —
 * a single unsplit revenue series (every qualifying order IS realized
 * revenue; there is no separate cobrado/pendiente subset). Every day
 * appears — including days with zero qualifying orders, at `{revenueUSD:0}`
 * — never omitted. Same zero-padded bucketing shape used across the app's other per-day/per-period builders.
 */
export function buildRevenueTrend(state: SeedState): RevenueTrendView {
  const anchorMs = new Date(state.generatedAt).getTime();
  const buckets = new Map<number, { revenueUSD: number }>();
  for (let offset = 0; offset < 20; offset++) {
    buckets.set(offset, { revenueUSD: 0 });
  }

  for (const order of state.orders) {
    if (order.state === 'creado') continue;
    const createdMs = new Date(order.createdAt).getTime();
    const diff = anchorMs - createdMs;
    if (diff < 0) continue;
    const offset = Math.floor(diff / DAY_MS);
    const bucket = buckets.get(offset);
    if (!bucket) continue; // outside the 20-day window
    bucket.revenueUSD += order.totalUSD;
  }

  const points: RevenueTrendPoint[] = [];
  for (let offset = 19; offset >= 0; offset--) {
    const bucket = buckets.get(offset)!;
    points.push({ dayOffset: offset, revenueUSD: bucket.revenueUSD });
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

// ---- warehouse revenue (Layer 3b) ---------------------------------------------------

export interface WarehouseRevenueRow {
  warehouseId: string;
  warehouseName: string;
  revenueUSD: number;
  /** # qualifying orders — gives the table a second column. */
  count: number;
}

export interface WarehouseRevenueView {
  rows: WarehouseRevenueRow[];
}

/**
 * One row per `state.warehouses` entry (all-time qualifying orders) — the
 * financial angle on warehouse sales: revenue and order count per
 * warehouse. A warehouse with zero qualifying orders still appears at 0,
 * never omitted. Sorted desc by revenueUSD.
 */
export function buildWarehouseRevenue(state: SeedState): WarehouseRevenueView {
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

// ---- product margin (Layer 3c) ------------------------------------------------------

export interface ProductMarginRow {
  productId: string;
  name: string;
  marginUSD: number;
}

export interface ProductMarginView {
  rows: ProductMarginRow[];
}

/**
 * Ranks products by aggregate margin (`Σ qty * (priceUSD - costUSD)`) across
 * all qualifying order lines — NOT revenue, and with NO per-line commission
 * allocation (commission is an order/gestor-level figure, not decomposable
 * per item). A product with no qualifying sales does not appear (not
 * zero-padded). Orphan `productId` lines contribute 0, never throw.
 * Finance-owned mirror of the deleted `buildTopMarginProducts`.
 */
export function buildProductMargin(state: SeedState): ProductMarginView {
  const productById = new Map(state.products.map((product) => [product.id, product]));
  const qualifyingOrders = qualifying(state.orders);
  const marginByProduct = new Map<string, number>();

  for (const order of qualifyingOrders) {
    for (const item of order.items) {
      const product = productById.get(item.productId);
      if (!product) continue; // orphan skip — no matching product
      const margin = item.quantity * (item.priceUSD - product.costUSD);
      marginByProduct.set(item.productId, (marginByProduct.get(item.productId) ?? 0) + margin);
    }
  }

  const rows: ProductMarginRow[] = [...marginByProduct.entries()].map(([productId, marginUSD]) => ({
    productId,
    name: productById.get(productId)!.name,
    marginUSD,
  }));
  rows.sort((a, b) => b.marginUSD - a.marginUSD); // desc, highest margin first

  return { rows };
}

// ---- low margin orders (Layer 3d) ---------------------------------------------------

export interface OrderMarginRow {
  orderId: string;
  clientName: string;
  revenueUSD: number;
  marginUSD: number;
}

export interface LowMarginOrdersView {
  rows: OrderMarginRow[];
}

/**
 * Per-qualifying-order net margin (`totalUSD - orderCostUSD -
 * orderCommissionUSD`), ascending (lowest margin first) with deterministic
 * tie-break by `orderId.localeCompare`. Lean row shape — `marginPercent` and
 * `isLoss` are dropped (unused at the leaf render); no "pérdida"/"loss"
 * framing anywhere. Finance-owned mirror of the deleted
 * `lowestMargin` re-sort.
 */
export function buildLowMarginOrders(state: SeedState): LowMarginOrdersView {
  const productById = new Map(state.products.map((product) => [product.id, product]));
  const rows: OrderMarginRow[] = qualifying(state.orders).map((order) => ({
    orderId: order.id,
    clientName: order.client.name,
    revenueUSD: order.totalUSD,
    marginUSD: orderMarginUSD(order, productById),
  }));
  rows.sort((a, b) => a.marginUSD - b.marginUSD || a.orderId.localeCompare(b.orderId));
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
  revenueTrend: RevenueTrendView;
  commissionLiability: CommissionLiabilityView;
  revenueByState: RevenueByStateView;
  currencyExposure: CurrencyExposureView;
  gestorCommission: GestorCommissionCostView;
  warehouseRevenue: WarehouseRevenueView;
  productMargin: ProductMarginView;
  lowMarginOrders: LowMarginOrdersView;
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
    revenueTrend: buildRevenueTrend(state),
    commissionLiability: {
      paidMN: summary.kpis.commissionPaidMN,
      pendingMN: summary.kpis.commissionPendingMN,
    },
    revenueByState: { rows: summary.rows },
    currencyExposure: buildCurrencyExposure(state),
    gestorCommission: buildGestorCommissionCost(state),
    warehouseRevenue: buildWarehouseRevenue(state),
    productMargin: buildProductMargin(state),
    lowMarginOrders: buildLowMarginOrders(state),
    stateBreakdown: summary.rows,
  };
}
