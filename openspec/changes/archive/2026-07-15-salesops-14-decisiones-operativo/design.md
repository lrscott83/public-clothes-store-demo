# Design — Rediseño operativo del dashboard de Decisiones (`salesops-14-decisiones-operativo`)

Reshape `/decisiones` from a sales/margin analytical dashboard into a 3-layer operational cockpit plus a windowed Análisis section. This is a **view-model + presentation redesign** — zero data-model, seed, or chart-primitive change. Every operational read is a new pure builder derived from fields the seed already persists (`state`, `warehouseId`, `transportistaId`, `verifiedAt`/`transportingAt`/`deliveredAt`/`commissionPaidAt`). Windows anchor to `state.generatedAt`; MN↔USD uses each order's frozen `exchangeRateSnapshot.usdToMn`. Read-only throughout (preserves the jsdom+undici `AbortSignal` sidestep).

## Architecture: layering and boundaries (unchanged rings)

```
loadSeedState() ─┬─► buildDecisionesDashboard(state): DecisionesView        (window-independent: Capa 1 + Capa 2)
                 └─► buildDecisionesWindow(state, windowDays): DecisionesWindowView   (Capa 3 + Análisis)
                        │  pure, numeric, unit-tested — one-helper-per-block; reuses period-trend.ts
                        ▼
      decisiones.tsx ── useState(seed) + useState(windowDays) + useMemo(windowed)  — thin read-only container
                        │  empty-state vs layers; no formatting; no RR7 Form/action/loader/useNavigate
                        ▼
   Section components (app/components/decisiones/*)  — format + compose charts
                        ▼
   Generic primitives (app/components/charts/*, shared/*)  — no domain import
```

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|----------|--------|-----------------------|-----------|
| Builder placement | Keep everything in the existing `domain/decisiones-dashboard.ts`, reshaped | New sibling `decisiones-operativo.ts` module | Matches `finanzas-dashboard.ts` precedent (one dashboard = one domain module, one-helper-per-block). Avoids a new import edge. |
| View split | TWO orchestrators: `buildDecisionesDashboard(state)` (Capa 1+2, window-independent) and `buildDecisionesWindow(state, windowDays)` (Capa 3 + Análisis) | Single orchestrator taking `windowDays`; recompute everything on toggle | Capa 1/2 never depend on the 7d/30d filter — recomputing them on every toggle is waste and churns the pulse cards. |
| 7d/30d mechanics | Add `splitByPeriodDays(state, days)` to `period-trend.ts`; refactor `splitByPeriod` to delegate `splitByPeriodDays(state, 10)` | Duplicate window math per builder | Single generalized window helper; finanzas behavior unchanged (10-day delegate). |
| Análisis windowing | Wrap existing builders with `windowedState(state, days)` (shallow clone, orders filtered to `[anchor-Nd, anchor)`) | Add a `windowDays` param to each Análisis builder | `buildWarehouseSales`/`buildCurrencyMix`/`buildGestorRanking` reused **unchanged** — the filter is applied by the SeedState passed in. |
| Warehouse colors | Presentation constant keyed by **warehouseId** in `components/decisiones/warehouse-colors.ts` | Keyed by name; inline in each chart | Colors are presentation, not domain. Id-keyed is stable to renames; reused by two charts. |
| `hasData` gate | `state.orders.length > 0` | Old `orders.some(o => o.state !== 'creado')` | Operational cockpit shows `creado` orders as active work — they must render, so the old creado-excluding gate no longer fits. |

## Interfaces / Contracts (new pure builders — all in `decisiones-dashboard.ts`)

Every field below maps to a REAL `types.ts` field. Shared spine kept: `qualifying`, `sumUSD`, `sumCommissionMN`, `isCommissionPending`, `PENDING_COMMISSION_STATES`. `GestorRankingRow.aovUSD` stays (per-gestor metric).

```ts
export type WindowDays = 7 | 30;
export const ACTIVE_STATES: OrderState[] = ['creado', 'verificado', 'transportando']; // entregado/comision_pagada excluded

// ── Capa 1 ──────────────────────────────────────────────────────────────────
// 1.1 activos por estado y almacén — off order.state + order.warehouseId
export interface ActiveOrdersCell { warehouseId: string; warehouseName: string; count: number }
export interface ActiveOrdersStateGroup { state: OrderState; label: string; cells: ActiveOrdersCell[]; total: number } // cells zero-padded per warehouse
export interface ActiveOrdersView { groups: ActiveOrdersStateGroup[] } // 3 groups, ACTIVE_STATES order
export function buildActiveOrdersByStateAndWarehouse(state: SeedState): ActiveOrdersView

// 1.2 transportistas — ocupado = tiene pedido en `transportando`; sinChofer = `verificado` sin transportistaId
export interface TransportistaCapacityRow { transportistaId: string; name: string; ocupado: boolean; ordersTransportando: number }
export interface TransportistaCapacityView { rows: TransportistaCapacityRow[]; disponibles: number; transportando: number; sinChofer: number }
export function buildTransportistaCapacity(state: SeedState): TransportistaCapacityView

// 1.3 comisiones por pagar — atrasada = deliveredAt != null && commissionPaidAt == null
export interface ComisionAtrasadaRow { gestorId: string; gestorName: string; diasAtraso: number; comisionMN: number; totalPendienteMN: number }
export interface ComisionesPorPagarView { totalPendienteMN: number; rows: ComisionAtrasadaRow[] } // one row per gestor (su pedido MÁS atrasado), sort desc diasAtraso
export function buildComisionesPorPagar(state: SeedState): ComisionesPorPagarView

// ── Capa 2 ──────────────────────────────────────────────────────────────────
// stock crítico → buildInventoryAlerts (existing, unchanged)
export type DelayStage = 'creado' | 'verificado' | 'transportando';
export const STAGE_DELAY_THRESHOLD_DAYS: Record<DelayStage, number> = { creado: 2, verificado: 3, transportando: 2 }; // DECIDED (owner-confirmed)
export interface PedidoDemoradoRow { orderId: string; clientName: string; stage: DelayStage; label: string; diasEnEtapa: number; thresholdDays: number }
export interface PedidosDemoradosView { rows: PedidoDemoradoRow[] } // solo diasEnEtapa >= threshold, sort desc diasEnEtapa
export function buildPedidosDemorados(state: SeedState): PedidosDemoradosView
// stageEnteredAt: creado→createdAt, verificado→verifiedAt, transportando→transportingAt; diasEnEtapa = floor((generatedAt - stageEnteredAt)/DAY_MS)

// ── Capa 3 (windowed) ─────────────────────────────────────────────────────────
export interface EntraVsSaleView { windowDays: number; creados: number; entregados: number; backlogDelta: number }
export function buildEntraVsSale(state: SeedState, windowDays: number): EntraVsSaleView
// creados = createdAt en ventana; entregados = deliveredAt en ventana; backlogDelta = creados - entregados

export interface CicloPromedioView { windowDays: number; currentAvgDays: number; priorAvgDays: number; deltaDays: number; count: number }
export function buildCicloPromedio(state: SeedState, windowDays: number): CicloPromedioView
// para orders con deliveredAt en ventana: ciclo = (deliveredAt - createdAt)/DAY_MS; Δ vs ventana previa; ÷0 guardado

export interface PerDayPoint { dayOffset: number; count: number; valueUSD: number } // 0 = anchor day (newest)
export interface PedidosPorDiaView { windowDays: number; points: PerDayPoint[]; avgCountPerDay: number; avgValuePerDay: number; countDeltaPercent: number | null; valueDeltaPercent: number | null }
export function buildPedidosPorDia(state: SeedState, windowDays: number): PedidosPorDiaView // bucket por createdAt; toggle Nº⇄valor es leaf

export interface CompletadosPorDiaView { windowDays: number; points: PerDayPoint[]; avgCountPerDay: number; avgValuePerDay: number; countDeltaPercent: number | null; tasaCompletado: number }
export function buildCompletadosPorDia(state: SeedState, windowDays: number): CompletadosPorDiaView // bucket por deliveredAt; tasaCompletado = entregadosEnVentana / creadosEnVentana (÷0→0)
// DECIDED: tasaCompletado denominador = cohorte de ENTRADA de la ventana (orders con createdAt en [anchor-Nd, anchor)); numerador = orders con deliveredAt en la misma ventana.
```

Window helper added to `period-trend.ts`:
```ts
export function splitByPeriodDays(state: SeedState, days: number): PeriodSplit  // current [anchor-Nd, anchor), prior [anchor-2Nd, anchor-Nd)
// splitByPeriod(state) === splitByPeriodDays(state, 10)  (finanzas unchanged)
```
Delta reuse: `computeDelta`/`buildKpiTrend` from `period-trend.ts` (Δ% and Δ vs previous window). Nothing new for ratio math.

## Per-stage "demorado" threshold — DECIDED (owner-confirmed)

Single named constant `STAGE_DELAY_THRESHOLD_DAYS` (one place to tune):

| Etapa | Umbral (días) | Rationale |
|-------|---------------|-----------|
| `creado` | **2** | Verificar es trabajo administrativo del día siguiente; a los 2 días sin verificar hay un cuello. |
| `verificado` | **3** | Es el bottleneck real (*mercadería lista parada* esperando chofer); +1 día de holgura porque depende de la capacidad de transportistas. |
| `transportando` | **2** | Reparto activo, debe ser lo más rápido; 2 días en la calle ya es demasiado. |

Grounding: el ciclo promedio completo `creado→entregado` ≈ **4.3 días** (maqueta) sobre 3 etapas ≈ ~1.4 días/etapa normal. Los umbrales están a ~2× lo normal para marcar estancamientos genuinos, no ruido. La maqueta muestra ejemplos coherentes (`Verificado hace 4d`, `Transportando hace 3d`, `Creado 2d`). Trivialmente ajustable: cambiar el objeto constante.

## Tasa de completado (Capa 3.2) — DECIDED (owner-confirmed)

`tasaCompletado = entregadosEnVentana / creadosEnVentana`, guardado a 0 cuando `creadosEnVentana == 0`.

- **Numerador**: orders con `deliveredAt` en `[anchor-Nd, anchor)`.
- **Denominador** ("total del período"): la **cohorte de entrada** de la ventana — orders con `createdAt` en `[anchor-Nd, anchor)`. No incluye órdenes creadas antes de la ventana aunque sigan abiertas.

## Data Flow

```
                 buildDecisionesDashboard(state)  ──►  Capa 1 (activeOrders, transportistas, comisiones) + Capa 2 (inventoryAlerts, pedidosDemorados)
loadSeedState() ─┤
                 buildDecisionesWindow(state, wd) ──►  Capa 3 (entraVsSale, cicloPromedio, pedidosPorDia, completadosPorDia) + Análisis (warehouses, currencyMix, gestores via windowedState)
                                                          ▲
                                          windowDays (useState 7|30) ── PeriodFilter toggle
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/domain/decisiones-dashboard.ts` | Modify | Remove `buildKpiHeader`/`KpiHeaderView`, `buildSalesTrend`/`SalesTrendView`, `buildStageDistribution`/`StageDistributionView` and now-unused margin helpers (`orderCostUSD`/`orderMarginUSD`/`orderCommissionUSD`). Add the 8 operational builders + `DecisionesView`/`DecisionesWindowView` orchestrators + `windowedState`. Keep `buildWarehouseSales`/`buildCurrencyMix`/`buildGestorRanking`/`buildInventoryAlerts`. |
| `app/domain/period-trend.ts` | Modify | Add `splitByPeriodDays(state, days)`; `splitByPeriod` delegates to it (behavior identical). |
| `app/components/decisiones/warehouse-colors.ts` | Create | `WAREHOUSE_COLORS` keyed by warehouseId: `wh-1` verde `#16a34a`, `wh-2` azul `#2563eb`, `wh-3` amarillo `#eab308`. |
| `app/components/decisiones/active-orders-chart.tsx` | Create | Grouped bars (3 estados × almacén), uses `WAREHOUSE_COLORS`. Replaces `stage-distribution.tsx`. |
| `app/components/decisiones/transportista-capacity.tsx` | Create | Capacidad + "Sin chofer". |
| `app/components/decisiones/comisiones-por-pagar.tsx` | Create | Total + filas más atrasadas. |
| `app/components/decisiones/pedidos-demorados.tsx` | Create | Filas con antigüedad/semáforo. |
| `app/components/decisiones/entra-vs-sale.tsx`, `ciclo-promedio.tsx`, `pedidos-por-dia.tsx`, `completados-por-dia.tsx`, `period-filter.tsx` | Create | Capa 3 leaves + el toggle `[7d/30d]`. `pedidos-por-dia` lleva su propio toggle Nº⇄valor (local `useState`). |
| `app/components/decisiones/{warehouse-sales,currency-mix,gestor-ranking,inventory-alerts}.tsx` | Keep | Análisis + stock crítico, unchanged. |
| `app/components/decisiones/{kpi-header,sales-trend-section,stage-distribution}.tsx` + tests + `help-content.ts` KPI/trend entries | Delete/Modify | Retire KPI header + sales trend + stage distribution and their tests. |
| `app/routes/decisiones.tsx` | Modify | Recompose into Capa 1/2/3 + Análisis; `useState(seed)` + `useState<WindowDays>(7)` + `useMemo(() => buildDecisionesWindow(state, windowDays))`. Read-only. |
| `openspec/specs/salesops-mvp/spec.md` | Modify (via delta) | Decisiones requirements rewritten per proposal. |

## Testing Strategy (Strict TDD — `vitest run` from `templates/apps/salesops-mvp/`)

| Layer | What | Approach |
|-------|------|----------|
| Unit (domain) | Each of the 8 builders + `splitByPeriodDays` + `windowedState` | RED-first: assert counts/derived rules against a hand-built `SeedState`; edge cases below. |
| Component | Each new leaf; PeriodFilter + Nº⇄valor toggles | Render with fixture view-model; assert labels/rows/colors. |
| Route | 3 layers + Análisis render; toggle recomputes Capa 3; read-only (no `<form>`) | jsdom render; simulate 7d↔30d; assert no old KPI/margin blocks. |

Edge cases: transportista con 0 pedidos → disponible; gestor sin comisión atrasada → no aparece; `deliveredAt`/`verifiedAt` ausente → excluido del cálculo de etapa; ventana sin órdenes → avg 0 / delta `null`; `usdToMn` 0 → 0 (nunca NaN); orphan `productId` no aplica (operativo no usa costo/margen).

## Migration / Rollout

No migration required. Additive-then-swap within the four Decisiones files + delta spec. If chained, natural slices: Capa 1 / Capa 2 / Capa 3 / Análisis. Revert via `git revert`.

## Open Questions

None — both prior questions are resolved (owner-confirmed):
- `STAGE_DELAY_THRESHOLD_DAYS` = { creado: 2, verificado: 3, transportando: 2 } — locked as-is.
- `tasaCompletado` denominador = cohorte de entrada de la ventana (`createdAt` en `[anchor-Nd, anchor)`) — locked.
