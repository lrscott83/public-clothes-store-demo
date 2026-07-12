# Design — Dashboard de Decisiones (`salesops-10-decisiones-dashboard`)

The `/decisiones` screen becomes a 3-layer visual dashboard built the SAME way every other salesops screen is built: a thin direct-render container computes ONE typed view model from `loadSeedState()` via pure domain helpers, then hands numeric view models to leaf presentational components. The only new ingredient is a set of small, hand-written **SVG chart primitives** (no chart library) that take already-computed numbers and render deterministic, assertable SVG.

## Quick path (decisions at a glance)

1. **Charts = custom inline SVG primitives** in `app/components/charts/` — `StatTile`, `BarChart`, `AreaTrend`, `DonutChart`. Zero new deps. No Recharts (its `ResponsiveContainer` measures 0 under jsdom and fights strict TDD).
2. **One orchestrator helper** `buildDecisionesDashboard(state): DashboardView` in `app/domain/decisiones-dashboard.ts` composes ~8 small pure sub-helpers, each independently unit-tested. Numbers only — no formatting, no I/O.
3. **Container** `decisiones.tsx` is rewritten to `useState(() => buildDecisionesDashboard(loadSeedState()))`, direct render, NO RR7 `Form`/loader/`useNavigate`. Empty-state when zero qualifying orders.
4. **Formatting only at leaves.** USD → `formatMoney(v, { locale: 'en-US', currency: 'USD' })`. MN → plain `` `${v} MN` `` (never `formatMoney` — MN is not ISO). Same rules as `inventory-summary.tsx` / `commission-summary.tsx`.
5. **Period split** = last 10 days vs prior 10, by `order.createdAt` relative to the seed anchor `ANCHOR_ISO`. Each order uses its OWN `exchangeRateSnapshot`. Orphan `productId` → contributes 0, never throws.

## Architecture: layering and boundaries

```
loadSeedState()  ──►  buildDecisionesDashboard(state): DashboardView   (app/domain/*)
                          │  (pure, numeric, unit-tested — composes sub-helpers)
                          ▼
      decisiones.tsx  ──  useState(() => view)  — thin container, direct render
                          │  (picks empty-state vs 3 layers; no formatting logic)
                          ▼
   Section components (app/components/decisiones/*)  — format + compose charts
                          │
                          ▼
   Chart primitives (app/components/charts/*)  — generic, pure SVG, no domain import
```

Three concentric rings, dependencies point inward only:

| Ring | Knows about | Never imports |
|------|-------------|---------------|
| **Domain** (`app/domain/decisiones-dashboard.ts` + sub-helpers) | `SeedState`, `types.ts`, existing helpers | React, formatting, `formatMoney`, DOM |
| **Sections** (`app/components/decisiones/*`) | the view-model types, `formatMoney`, chart primitives | `SeedState`, `loadSeedState`, data derivation |
| **Charts** (`app/components/charts/*`) | plain numeric/label props | any `app/domain/*` type, `SeedState`, `formatMoney` |

Chart primitives are **generic** (screaming architecture): they take `{ label, value }[]` shaped props, know nothing about pedidos or margen. Reusable by any future screen. Domain-specific formatting (`$`, `MN`, `%`) is decided by the section component and passed in as already-formatted `label` strings or via an injected `formatValue` prop — the chart itself only positions and draws.

## The chart decision (locked — build on it, do not reopen)

**Custom inline SVG/CSS chart primitives. No chart library.**

| Aspect | Why this wins here |
|--------|--------------------|
| Strict TDD | SVG renders synchronously under jsdom; `container.querySelectorAll('rect'/'path'/'circle')` and `getByText` on `<text>` nodes are directly assertable. Recharts `ResponsiveContainer` measures 0 without dimension mocking. |
| Complexity | The needed shapes (horizontal/vertical bars, area/line trend, donut, per-state distribution bars) are trivial hand-written SVG. |
| Deps / bundle | Zero new dependencies. |
| Theming | Full Tailwind token control (`fill-*`, `stroke-*`, `text-*`), light/dark aware, no library theme fight. |
| Responsiveness | `viewBox` + `width:100%` scales without JS measurement. |

## Domain layer: the view model

### Orchestrator

```ts
// app/domain/decisiones-dashboard.ts
export function buildDecisionesDashboard(state: SeedState): DashboardView
```

Composes the sub-helpers below and returns a single typed object. `hasData` is `false` when no order qualifies for ANY layer (only `creado` orders / empty seed) — the container renders the empty-state instead of the layers.

```ts
export interface DashboardView {
  hasData: boolean;
  kpis: KpiHeaderView;          // Layer 1
  salesTrend: SalesTrendView;   // Layer 2a
  stages: StageDistributionView;// Layer 2b
  warehouses: WarehouseSalesView;// Layer 2c
  currencyMix: CurrencyMixView; // Layer 2d
  gestores: GestorRankingView;  // Layer 3a
  topMargin: TopMarginView;     // Layer 3b
  inventoryAlerts: InventoryAlertsView; // Layer 3c-i
  lowestMargin: ProfitabilityRow[];     // Layer 3c-ii (ascending tail)
}
```

### Sub-helpers (one per aggregation — each pure, each unit-tested)

Each lives in `app/domain/decisiones-dashboard.ts` (or split into `decisiones-dashboard/*.ts` if the file grows). All exported so tests can target them in isolation.

| Helper | Signature | Produces | Derivation rule |
|--------|-----------|----------|-----------------|
| `splitByPeriod` | `(state) => { current: Order[]; prior: Order[] }` | period buckets | `createdAt >= anchor − 10d` → current; `anchor − 20d <= createdAt < anchor − 10d` → prior. Anchor = `ANCHOR_ISO`. |
| `buildKpiHeader` | `(state) => KpiHeaderView` | 5 KPI tiles w/ current, prior, delta | See KPI table below. Delta = `(current − prior) / prior`; `prior === 0` → `delta: null` (leaf shows "—"). |
| `buildSalesTrend` | `(state) => SalesTrendView` | 20-day series | Bucket ALL orders by `createdAt` day-offset 0..19 from anchor. Each day: `count` (cantidad) + `valueUSD` (Σ `totalUSD`). Missing days = 0. Ordered oldest→newest. |
| `buildStageDistribution` | `(state) => StageDistributionView` | 5 stage counts | One entry per `OrderState` in fixed order (reuse the `STATE_LABELS`/order convention from `finanzas.ts`). Snapshot counts — labeled "distribution", not conversion. |
| `buildWarehouseSales` | `(state) => WarehouseSalesView` | per-warehouse Σ USD + count | Group non-`creado` orders by `warehouseId`; resolve name via `state.warehouses`. Sorted desc by `valueUSD`. |
| `buildCurrencyMix` | `(state) => CurrencyMixView` | slices per payment method | Group by `order.payment.method` (USD/MN/ZELLE/EUR). Each slice: `count` + `valueUSD` (Σ `totalUSD`). Percent computed at leaf. |
| `buildGestorRanking` | `(state) => GestorRankingView` | per-gestor sales/AOV/commission | Group by `gestorId`; `salesUSD` = Σ `totalUSD`, `aovUSD` = salesUSD/count, `commissionAccruedMN` / `commissionPendingMN` (paid vs pending, mirror `finanzas.ts` paid/pending logic). Sorted desc by `salesUSD`. |
| `buildTopMarginProducts` | `(state) => TopMarginView` | products ranked by Σ margin USD | For each order item resolve product; accumulate `marginUSD = (item.priceUSD − product.costUSD) × qty` per product (orphan skip → 0). Sorted desc, top N (e.g. 5). |
| `buildInventoryAlerts` | `(state) => InventoryAlertsView` | low/out rows per warehouse | Reuse `buildInventorySummary(state)`, keep only rows whose `status !== 'ok'`. Grouped by warehouse; empty group omitted. |
| _(reuse)_ `buildProfitabilityRanking` | `(state) => ProfitabilityView` | margin-sorted rows | Take the ASCENDING tail (lowest margin first) for `lowestMargin`. NO new logic. |

## Next step

Run `sdd-tasks` (after the spec is ready) to slice this file-by-file plan into ordered RED→GREEN work units.
