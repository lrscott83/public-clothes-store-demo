import { buildInventorySummary } from './inventory';
import { computeDelta, splitByPeriod } from './period-trend';
import type { KpiTrend, PeriodSplit, Trend } from './period-trend';
import { DAY_MS } from '../seed/constants';
import type { Order, OrderState, SeedState } from './types';

/**
 * Domain view-model builder for the `/decisiones` dashboard. Pure — numbers
 * only, no formatting, no I/O. Every helper below is independently exported
 * for isolated unit testing and composed directly by `routes/decisiones.tsx`.
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

// ---- operational window (Capa 3 + Análisis) ---------------------------------------

/** The `[7d/30d]` filter shared by Capa 3 and the Análisis section. */
export type WindowDays = 7 | 30;

/** The 3 non-completed states — used everywhere "activo"/"en curso" is meant. */
export const ACTIVE_STATES: OrderState[] = ['creado', 'verificado', 'transportando'];

export type DelayStage = 'creado' | 'verificado' | 'transportando';

/**
 * Owner-confirmed per-stage "demorado" thresholds (see design.md). One place
 * to tune — Capa 2's `buildPedidosDemorados` reads this constant.
 */
export const STAGE_DELAY_THRESHOLD_DAYS: Record<DelayStage, number> = {
  creado: 2,
  verificado: 3,
  transportando: 2,
};

/**
 * Shallow-clones `state` with `orders` replaced by only those whose
 * `createdAt` falls in `[anchor-Nd, anchor)`, anchored to `state.generatedAt`
 * (never mutated). Every other field is passed through by reference — this
 * lets window-agnostic builders (`buildWarehouseSales`, `buildCurrencyMix`,
 * `buildGestorRanking`) be reused unchanged for the windowed Análisis section.
 */
export function windowedState(state: SeedState, days: number): SeedState {
  const anchorMs = new Date(state.generatedAt).getTime();
  const orders = state.orders.filter((order) => {
    const createdMs = new Date(order.createdAt).getTime();
    const diff = anchorMs - createdMs;
    return diff >= 0 && diff < days * DAY_MS;
  });

  return { ...state, orders };
}

// ---- shared order helpers --------------------------------------------------------------

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

// ---- stage labels (shared) -----------------------------------------------------------

const STAGE_LABELS: Record<OrderState, string> = {
  creado: 'Creado',
  verificado: 'Verificado',
  transportando: 'Transportando',
  entregado: 'Entregado',
  comision_pagada: 'Comisión pagada',
};

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

// ---- Capa 1.1: activos por estado y almacén --------------------------------------------

export interface ActiveOrdersCell {
  warehouseId: string;
  warehouseName: string;
  count: number;
}

export interface ActiveOrdersStateGroup {
  state: OrderState;
  label: string;
  cells: ActiveOrdersCell[];
  total: number;
}

export interface ActiveOrdersView {
  groups: ActiveOrdersStateGroup[];
}

/**
 * Capa 1.1 — "Pedidos activos por estado y almacén": exactly the 3
 * non-completed states (`ACTIVE_STATES`, fixed order), each split into one
 * cell per `state.warehouses` entry (zero-padded — a state/warehouse pair
 * with no matching orders still appears at `count:0`, never omitted).
 */
export function buildActiveOrdersByStateAndWarehouse(state: SeedState): ActiveOrdersView {
  const groups: ActiveOrdersStateGroup[] = ACTIVE_STATES.map((orderState) => {
    const cells: ActiveOrdersCell[] = state.warehouses.map((warehouse) => ({
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      count: state.orders.filter((order) => order.state === orderState && order.warehouseId === warehouse.id).length,
    }));
    const total = cells.reduce((sum, cell) => sum + cell.count, 0);
    return { state: orderState, label: STAGE_LABELS[orderState], cells, total };
  });

  return { groups };
}

// ---- Capa 1.2: transportistas ------------------------------------------------------------

export interface TransportistaCapacityRow {
  transportistaId: string;
  name: string;
  ocupado: boolean;
  ordersTransportando: number;
}

export interface TransportistaCapacityView {
  rows: TransportistaCapacityRow[];
  disponibles: number;
  transportando: number;
  sinChofer: number;
}

/**
 * Capa 1.2 — transportista capacity: `ocupado` = has at least one order in
 * `transportando` assigned via `transportistaId`; `disponible` otherwise.
 * "Sin chofer" is a separate count of `verificado` orders with no
 * `transportistaId` set — reported independently of the ocupado/disponible
 * split (it counts orders, not transportistas).
 */
export function buildTransportistaCapacity(state: SeedState): TransportistaCapacityView {
  const rows: TransportistaCapacityRow[] = state.transportistas.map((transportista) => {
    const ordersTransportando = state.orders.filter(
      (order) => order.state === 'transportando' && order.transportistaId === transportista.id,
    ).length;
    return {
      transportistaId: transportista.id,
      name: transportista.name,
      ocupado: ordersTransportando > 0,
      ordersTransportando,
    };
  });

  const disponibles = rows.filter((row) => !row.ocupado).length;
  const transportando = rows.filter((row) => row.ocupado).length;
  const sinChofer = state.orders.filter((order) => order.state === 'verificado' && !order.transportistaId).length;

  return { rows, disponibles, transportando, sinChofer };
}

// ---- Capa 1.3: comisiones por pagar ------------------------------------------------------

export interface ComisionAtrasadaRow {
  gestorId: string;
  gestorName: string;
  diasAtraso: number;
  comisionMN: number;
  totalPendienteMN: number;
}

export interface ComisionesPorPagarView {
  totalPendienteMN: number;
  rows: ComisionAtrasadaRow[];
}

/**
 * Capa 1.3 — "Comisiones por pagar": `totalPendienteMN` sums `commissionMN`
 * across every order pending commission (`PENDING_COMMISSION_STATES`, unpaid
 * — same shared definition as the KPI header). The "más atrasadas" list adds
 * at most one row per gestor: their most-overdue unpaid `entregado` order
 * (only `entregado` orders count toward "atraso" — commission becomes
 * payable on delivery). A gestor with zero such orders does not appear.
 */
export function buildComisionesPorPagar(state: SeedState): ComisionesPorPagarView {
  const anchorMs = new Date(state.generatedAt).getTime();
  const gestorById = new Map(state.gestores.map((gestor) => [gestor.id, gestor]));

  const pendingOrders = state.orders.filter(isCommissionPending);
  const totalPendienteMN = sumCommissionMN(pendingOrders);

  const pendingByGestor = new Map<string, Order[]>();
  for (const order of pendingOrders) {
    const list = pendingByGestor.get(order.gestorId) ?? [];
    list.push(order);
    pendingByGestor.set(order.gestorId, list);
  }

  const rows: ComisionAtrasadaRow[] = [];
  for (const [gestorId, orders] of pendingByGestor) {
    const overdueEntregados = orders.filter((order) => order.state === 'entregado' && order.deliveredAt);
    if (overdueEntregados.length === 0) continue;

    const mostOverdue = overdueEntregados.reduce((worst, order) =>
      new Date(order.deliveredAt!).getTime() < new Date(worst.deliveredAt!).getTime() ? order : worst,
    );

    const diasAtraso = Math.floor((anchorMs - new Date(mostOverdue.deliveredAt!).getTime()) / DAY_MS);
    const totalPendienteGestorMN = sumCommissionMN(orders);

    rows.push({
      gestorId,
      gestorName: gestorById.get(gestorId)?.name ?? gestorId,
      diasAtraso,
      comisionMN: mostOverdue.commissionMN ?? 0,
      totalPendienteMN: totalPendienteGestorMN,
    });
  }

  rows.sort((a, b) => b.diasAtraso - a.diasAtraso);

  return { totalPendienteMN, rows };
}

// ---- Capa 2: pedidos demorados / trabados -------------------------------------------------

export interface PedidoDemoradoRow {
  orderId: string;
  clientName: string;
  stage: DelayStage;
  label: string;
  diasEnEtapa: number;
  thresholdDays: number;
}

export interface PedidosDemoradosView {
  rows: PedidoDemoradoRow[];
}

function stageEnteredAt(order: Order, stage: DelayStage): string | undefined {
  if (stage === 'creado') return order.createdAt;
  if (stage === 'verificado') return order.verifiedAt;
  return order.transportingAt;
}

/**
 * Capa 2 — "Pedidos demorados/trabados": flags an order in one of the 3
 * non-completed states whose age in its CURRENT stage — measured from the
 * timestamp it entered that stage, anchored to `state.generatedAt` — exceeds
 * `STAGE_DELAY_THRESHOLD_DAYS` for that stage. `entregado`/`comision_pagada`
 * orders are never evaluated. An order missing the relevant stage timestamp
 * (e.g. a `verificado` order with no `verifiedAt`) is excluded rather than
 * treated as infinitely old.
 */
export function buildPedidosDemorados(state: SeedState): PedidosDemoradosView {
  const anchorMs = new Date(state.generatedAt).getTime();

  const rows: PedidoDemoradoRow[] = [];
  for (const order of state.orders) {
    if (order.state !== 'creado' && order.state !== 'verificado' && order.state !== 'transportando') continue;
    const stage = order.state as DelayStage;

    const enteredAt = stageEnteredAt(order, stage);
    if (!enteredAt) continue;

    const diasEnEtapa = Math.floor((anchorMs - new Date(enteredAt).getTime()) / DAY_MS);
    const thresholdDays = STAGE_DELAY_THRESHOLD_DAYS[stage];
    if (diasEnEtapa < thresholdDays) continue;

    rows.push({
      orderId: order.id,
      clientName: order.client.name,
      stage,
      label: STAGE_LABELS[stage],
      diasEnEtapa,
      thresholdDays,
    });
  }

  rows.sort((a, b) => b.diasEnEtapa - a.diasEnEtapa);

  return { rows };
}

// ---- Capa 3 window helpers -------------------------------------------------------------

/** `true` when `ms` falls in the current `[anchor-Nd, anchor)` window — mirrors `splitByPeriodDays`. */
function inCurrentWindow(ms: number, anchorMs: number, days: number): boolean {
  const diff = anchorMs - ms;
  return diff >= 0 && diff < days * DAY_MS;
}

/** `true` when `ms` falls in the immediately preceding `[anchor-2Nd, anchor-Nd)` window. */
function inPriorWindow(ms: number, anchorMs: number, days: number): boolean {
  const diff = anchorMs - ms;
  return diff >= days * DAY_MS && diff < 2 * days * DAY_MS;
}

// ---- Capa 3: entra vs. sale --------------------------------------------------------------

export interface EntraVsSaleView {
  windowDays: number;
  creados: number;
  entregados: number;
  /** creados - entregados; positive means backlog is growing. */
  backlogDelta: number;
}

/**
 * Capa 3 — "Entra vs. sale": within `[anchor-Nd, anchor)`, `creados` counts
 * orders by `createdAt` and `entregados` counts orders by `deliveredAt` —
 * two independent counts over the SAME window, not a funnel. When creados
 * exceeds entregados the caller renders a backlog signal.
 */
export function buildEntraVsSale(state: SeedState, windowDays: number): EntraVsSaleView {
  const anchorMs = new Date(state.generatedAt).getTime();

  const creados = state.orders.filter((order) =>
    inCurrentWindow(new Date(order.createdAt).getTime(), anchorMs, windowDays),
  ).length;

  const entregados = state.orders.filter(
    (order) => order.deliveredAt && inCurrentWindow(new Date(order.deliveredAt).getTime(), anchorMs, windowDays),
  ).length;

  return { windowDays, creados, entregados, backlogDelta: creados - entregados };
}

// ---- Capa 3: ciclo promedio (creado -> entregado) -----------------------------------------

export interface CicloPromedioView {
  windowDays: number;
  currentAvgDays: number;
  priorAvgDays: number;
  /** currentAvgDays - priorAvgDays; forced to 0 (safe/flat) when the prior window has zero delivered orders. */
  deltaDays: number;
  /** Number of orders contributing to currentAvgDays. */
  count: number;
}

/**
 * Capa 3 — "Ciclo promedio (creado → entregado)": average of
 * `(deliveredAt - createdAt)` in days across orders whose `deliveredAt`
 * falls in the current `[anchor-Nd, anchor)` window, plus the same average
 * over the immediately preceding window of equal length. Orders with no
 * `deliveredAt` never contribute to either average. When the prior window
 * has zero delivered orders, `deltaDays` is forced to 0 (safe/flat) instead
 * of leaking a misleading delta against an empty baseline.
 */
export function buildCicloPromedio(state: SeedState, windowDays: number): CicloPromedioView {
  const anchorMs = new Date(state.generatedAt).getTime();

  const currentCycles: number[] = [];
  const priorCycles: number[] = [];

  for (const order of state.orders) {
    if (!order.deliveredAt) continue;
    const deliveredMs = new Date(order.deliveredAt).getTime();
    const cycleDays = (deliveredMs - new Date(order.createdAt).getTime()) / DAY_MS;

    if (inCurrentWindow(deliveredMs, anchorMs, windowDays)) {
      currentCycles.push(cycleDays);
    } else if (inPriorWindow(deliveredMs, anchorMs, windowDays)) {
      priorCycles.push(cycleDays);
    }
  }

  const count = currentCycles.length;
  const currentAvgDays = count > 0 ? currentCycles.reduce((sum, days) => sum + days, 0) / count : 0;
  const priorAvgDays =
    priorCycles.length > 0 ? priorCycles.reduce((sum, days) => sum + days, 0) / priorCycles.length : 0;
  const deltaDays = priorCycles.length > 0 ? currentAvgDays - priorAvgDays : 0;

  return { windowDays, currentAvgDays, priorAvgDays, deltaDays, count };
}

// ---- Capa 3: per-day point buckets (shared by pedidos/día + completados/día) ----------------

export interface PerDayPoint {
  /** 0 = the anchor day (newest), `windowDays - 1` = oldest day in the window. */
  dayOffset: number;
  count: number;
  valueUSD: number;
}

interface PerDayBucketResult {
  /** Ordered oldest -> newest (dayOffset windowDays-1 .. 0). */
  points: PerDayPoint[];
  totalCount: number;
  totalValueUSD: number;
  priorTotalCount: number;
  priorTotalValueUSD: number;
}

/**
 * Zero-pads every day in `[anchor-Nd, anchor)` into a bucket (never omits a
 * day with no matching orders), grouping by whichever timestamp
 * `pickTimestamp` returns (undefined = order excluded from both windows).
 * Also accumulates the prior `[anchor-2Nd, anchor-Nd)` window's totals for
 * the caller's Δ% math — one pass over `state.orders`.
 */
function buildPerDayBuckets(
  state: SeedState,
  windowDays: number,
  pickTimestamp: (order: Order) => string | undefined,
): PerDayBucketResult {
  const anchorMs = new Date(state.generatedAt).getTime();
  const buckets = new Map<number, { count: number; valueUSD: number }>();
  for (let offset = 0; offset < windowDays; offset++) {
    buckets.set(offset, { count: 0, valueUSD: 0 });
  }

  let priorTotalCount = 0;
  let priorTotalValueUSD = 0;

  for (const order of state.orders) {
    const timestamp = pickTimestamp(order);
    if (!timestamp) continue;
    const ms = new Date(timestamp).getTime();
    const diff = anchorMs - ms;

    if (diff >= 0 && diff < windowDays * DAY_MS) {
      const offset = Math.floor(diff / DAY_MS);
      const bucket = buckets.get(offset)!;
      bucket.count += 1;
      bucket.valueUSD += order.totalUSD;
    } else if (diff >= windowDays * DAY_MS && diff < 2 * windowDays * DAY_MS) {
      priorTotalCount += 1;
      priorTotalValueUSD += order.totalUSD;
    }
  }

  const points: PerDayPoint[] = [];
  let totalCount = 0;
  let totalValueUSD = 0;
  for (let offset = windowDays - 1; offset >= 0; offset--) {
    const bucket = buckets.get(offset)!;
    points.push({ dayOffset: offset, count: bucket.count, valueUSD: bucket.valueUSD });
    totalCount += bucket.count;
    totalValueUSD += bucket.valueUSD;
  }

  return { points, totalCount, totalValueUSD, priorTotalCount, priorTotalValueUSD };
}

// ---- Capa 3: pedidos por día -----------------------------------------------------------

export interface PedidosPorDiaView {
  windowDays: number;
  points: PerDayPoint[];
  avgCountPerDay: number;
  avgValuePerDay: number;
  /** null when the prior window's average is 0 — the leaf renders a safe "up"/flat guard instead of Infinity. */
  countDeltaPercent: number | null;
  valueDeltaPercent: number | null;
}

/**
 * Capa 3 — "Pedidos por día": one zero-padded point per calendar day in
 * `[anchor-Nd, anchor)`, grouped by `createdAt`. `avgCountPerDay`/
 * `avgValuePerDay` divide by `windowDays` (every day counts, including zero
 * days). Deltas reuse `computeDelta` — `null` (never NaN/Infinity) when the
 * prior window's average is 0.
 */
export function buildPedidosPorDia(state: SeedState, windowDays: number): PedidosPorDiaView {
  const { points, totalCount, totalValueUSD, priorTotalCount, priorTotalValueUSD } = buildPerDayBuckets(
    state,
    windowDays,
    (order) => order.createdAt,
  );

  const avgCountPerDay = totalCount / windowDays;
  const avgValuePerDay = totalValueUSD / windowDays;
  const priorAvgCountPerDay = priorTotalCount / windowDays;
  const priorAvgValuePerDay = priorTotalValueUSD / windowDays;

  return {
    windowDays,
    points,
    avgCountPerDay,
    avgValuePerDay,
    countDeltaPercent: computeDelta(avgCountPerDay, priorAvgCountPerDay),
    valueDeltaPercent: computeDelta(avgValuePerDay, priorAvgValuePerDay),
  };
}

// ---- Capa 3: completados por día -------------------------------------------------------

export interface CompletadosPorDiaView {
  windowDays: number;
  points: PerDayPoint[];
  avgCountPerDay: number;
  avgValuePerDay: number;
  /** null when the prior window's average is 0 — same guard as PedidosPorDiaView. */
  countDeltaPercent: number | null;
  /** entregadosEnVentana / creadosEnVentana, guarded to 0 when creadosEnVentana is 0. LOCKED denominator: the window's entry cohort (createdAt), same as buildEntraVsSale. */
  tasaCompletado: number;
}

/**
 * Capa 3 — "Completados por día": one zero-padded point per calendar day in
 * `[anchor-Nd, anchor)`, grouped by `deliveredAt` (same shape as
 * `buildPedidosPorDia`). `tasaCompletado` = orders delivered in the window
 * divided by orders CREATED in the window (the window's entry cohort, not a
 * throughput ratio) — DECIDED in design.md, guarded to 0 when the
 * denominator is 0.
 */
export function buildCompletadosPorDia(state: SeedState, windowDays: number): CompletadosPorDiaView {
  const anchorMs = new Date(state.generatedAt).getTime();
  const { points, totalCount, totalValueUSD, priorTotalCount } = buildPerDayBuckets(
    state,
    windowDays,
    (order) => order.deliveredAt,
  );

  const avgCountPerDay = totalCount / windowDays;
  const avgValuePerDay = totalValueUSD / windowDays;
  const priorAvgCountPerDay = priorTotalCount / windowDays;

  const creadosEnVentana = state.orders.filter((order) =>
    inCurrentWindow(new Date(order.createdAt).getTime(), anchorMs, windowDays),
  ).length;
  const tasaCompletado = creadosEnVentana > 0 ? totalCount / creadosEnVentana : 0;

  return {
    windowDays,
    points,
    avgCountPerDay,
    avgValuePerDay,
    countDeltaPercent: computeDelta(avgCountPerDay, priorAvgCountPerDay),
    tasaCompletado,
  };
}
