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

### KPI tiles (Layer 1)

| Tile | `value` (current period) | Unit / format at leaf | `positiveIsGood` |
|------|--------------------------|-----------------------|------------------|
| Ventas | Σ `totalUSD` | USD `formatMoney` | true |
| Margen | Σ (`totalUSD − costUSD − commissionUSD`) + `marginPercent` | USD + `%` | true |
| Pedidos | count + AOV (Σ USD / count) | integer + USD | true |
| Comisión pendiente | Σ unpaid `commissionMN` | `` `${v} MN` `` | **false** (more owed = worse) |
| Cobrado vs pendiente | delivered/paid USD vs in-transit USD | USD + USD | true |

Each tile view: `{ label, value, prior, delta: number | null, positiveIsGood, sublabel? }`. The leaf `StatTile` turns `delta` into an arrow (`▲`/`▼`/`—`) and a color, using `positiveIsGood` to decide green/red — so a rising "Comisión pendiente" shows red. `delta === null` → neutral "—" (no prior-period baseline).

## SVG chart primitives + prop contracts + render-test strategy

All live in `app/components/charts/`. Each renders an `<svg role="img" aria-label={...} viewBox=... width="100%">`. Colors come from a shared categorical palette module `app/components/charts/palette.ts` (Tailwind class tokens, light+dark aware).

| Primitive | Props | Renders | Render test asserts |
|-----------|-------|---------|---------------------|
| `StatTile` | `{ label, value: string, delta?: number \| null, positiveIsGood?: boolean, sublabel?: string }` | a card (div, not SVG): label, big value, trend arrow+delta%, optional sublabel | label text present; value string present; arrow symbol `▲`/`▼`/`—` matches sign; color class matches `positiveIsGood`; `delta` undefined/null → no arrow |
| `BarChart` | `{ bars: { label: string; value: number; colorKey?: string }[]; orientation?: 'horizontal' \| 'vertical'; formatValue?: (n) => string; ariaLabel: string }` | one `<rect>` per bar (length ∝ value / max), one `<text>` label per bar, optional value `<text>` | `querySelectorAll('rect').length === bars.length`; each `label` via `getByText`; formatted values present; empty `bars` → renders svg shell, no rect, no throw |
| `AreaTrend` | `{ points: { label: string; value: number }[]; ariaLabel: string; formatValue?: (n) => string }` | one `<polyline>` (line) + one `<path>`/`<polygon>` (area fill); optional axis `<text>` ticks | a `polyline`/`path` element exists; its `points`/`d` contains `points.length` coordinate pairs; endpoints match min/max scaling (assert first & last coord); empty → no line, no throw |
| `DonutChart` | `{ slices: { label: string; value: number; colorKey?: string }[]; ariaLabel: string }` | one arc `<path>` (or `<circle>` w/ stroke-dasharray) per slice + a legend list (label + computed %) | `querySelectorAll('path'/'circle').length === slices.length`; legend labels via `getByText`; percent text (`Σ = 100`) present; single slice → full ring, no throw; empty → no arc |

Render tests never assert pixel geometry. They assert **structure** (element counts) and **values** (label text, formatted numbers, arrow direction, coordinate-pair count). Each primitive gets `__tests__/<name>.test.tsx` colocated, mirroring the existing `profitability-table.test.tsx` pattern.

## Component tree (sections)

Container composes section components; each section formats and composes chart primitives. **No section heading may contain the word "decisiones"** — `routes.test.tsx` asserts `getByRole('heading', { name: /decisiones/i })` resolves to the page `<h1>` alone (same rule honored by `ProfitabilitySummary` and `CommissionSummary`).

```
decisiones.tsx  (h1 "Decisiones")
├─ KpiHeader            props: KpiHeaderView            → 5× StatTile
├─ SalesTrendSection    props: SalesTrendView           → AreaTrend  (local useState toggle cantidad↔valor)
├─ StageDistribution    props: StageDistributionView    → BarChart (vertical)
├─ WarehouseSales       props: WarehouseSalesView       → BarChart (horizontal)
├─ CurrencyMix          props: CurrencyMixView          → DonutChart
├─ GestorRanking        props: GestorRankingView        → table
├─ TopMarginProducts    props: TopMarginView            → BarChart (horizontal) or table
├─ InventoryAlerts      props: InventoryAlertsView      → grouped list + StockBadge (reuse)
└─ LowestMarginOrders   props: ProfitabilityRow[]       → table (ascending margin)
```

| Section | Heading (no "decisiones") | Key behavior | Deps |
|---------|---------------------------|--------------|------|
| `KpiHeader` | (tiles carry own labels) | grid of 5 `StatTile` | `StatTile` |
| `SalesTrendSection` | "Tendencia de ventas (20 días)" | `useState<'cantidad'\|'valor'>`; two buttons switch which series feeds `AreaTrend`; formats USD when 'valor', integer when 'cantidad' | `AreaTrend`, `formatMoney` |
| `StageDistribution` | "Pedidos por etapa" | vertical bars, one per stage; subtitle clarifies "distribución, no conversión" | `BarChart` |
| `WarehouseSales` | "Ventas por almacén" | horizontal bars, USD formatted | `BarChart`, `formatMoney` |
| `CurrencyMix` | "Mix por moneda" | donut USD/MN/ZELLE/EUR + legend % | `DonutChart` |
| `GestorRanking` | "Ranking de gestores" | table: gestor, ventas, AOV, comisión devengada/pendiente | `formatMoney` (USD), MN plain |
| `TopMarginProducts` | "Top productos por margen" | ranked by margin USD (not revenue) | `BarChart` or table, `formatMoney` |
| `InventoryAlerts` | "Alertas de inventario" | per-warehouse low/out rows | `StockBadge` (reuse) |
| `LowestMarginOrders` | "Pedidos de menor margen" | ascending margin table; may reuse `ProfitabilityTable` styling | `formatMoney` |

## Data-derivation rules (invariants)

| Rule | Statement |
|------|-----------|
| Period split | By `order.createdAt` vs `ANCHOR_ISO`: `[anchor−10d, anchor]` = current, `[anchor−20d, anchor−10d)` = prior. `DAY_MS` from constants. |
| Per-order rate | Every MN↔USD conversion uses `order.exchangeRateSnapshot.usdToMn` (fallback 0 → contributes 0), NEVER live `state.exchangeRates`. Mirrors `buildProfitabilityRanking`. |
| Orphan product | `productId` with no matching product → skipped, contributes 0 to cost/margin, never throws. |
| `creado` exclusion | Orders in `creado` have no frozen totals: excluded from margin/warehouse/gestor sales aggregations (present only in stage distribution counts). Consistent with `buildProfitabilityRanking`. |
| MN vs USD | Commission KPIs stay native MN (plain `${v} MN`); everything sales/margin is USD via `formatMoney`. |
| Empty state | `hasData === false` → container renders a single `<p className="text-text-muted">` message, no layers, no chart throws. Each chart also self-guards empty input. |
| Determinism | Builder reads the frozen seed only; no `Date.now()`, no RNG — output is stable for tests. |

## Theme / visual approach

- **Tokens:** reuse the app's existing Tailwind semantic tokens — `text`, `text-muted`, `surface`, `border`, `accent`. No raw hex in components.
- **Categorical palette:** `app/components/charts/palette.ts` exports an ordered array of Tailwind fill/stroke class pairs (e.g. accent, plus 3-4 complementary hues) that resolve in both light and dark. Slices/bars map by index or `colorKey`. Single source so all charts stay visually consistent.
- **Responsive:** every chart `<svg>` uses `viewBox="0 0 W H"` + `width:100%`, `height:auto` — scales fluidly, no JS measurement (the exact reason a library was rejected).
- **Accessibility:** each chart svg carries `role="img"` + `aria-label`; donut/bar values also surface as real `<text>`/legend nodes so they are screen-readable AND test-assertable.

## File-by-file plan (for the tasks phase to slice)

**New — chart primitives** (`app/components/charts/`)
- `palette.ts` — categorical Tailwind class palette.
- `stat-tile.tsx` + `__tests__/stat-tile.test.tsx`
- `bar-chart.tsx` + `__tests__/bar-chart.test.tsx`
- `area-trend.tsx` + `__tests__/area-trend.test.tsx`
- `donut-chart.tsx` + `__tests__/donut-chart.test.tsx`

**New — domain** (`app/domain/`)
- `decisiones-dashboard.ts` — `buildDecisionesDashboard` + sub-helpers + exported view-model types.
- `__tests__/decisiones-dashboard.test.ts` — unit tests per sub-helper (period split, KPIs w/ deltas + null-prior, trend buckets, stage counts, warehouse sales, currency mix, gestor ranking, top margin, inventory alerts, orphan/empty edge cases).

**New — section components** (`app/components/decisiones/`) — each with colocated `__tests__/*.test.tsx`
- `kpi-header.tsx`, `sales-trend-section.tsx`, `stage-distribution.tsx`, `warehouse-sales.tsx`, `currency-mix.tsx`, `gestor-ranking.tsx`, `top-margin-products.tsx`, `inventory-alerts.tsx`, `lowest-margin-orders.tsx`

**Rewrite**
- `app/routes/decisiones.tsx` — swap `buildProfitabilityRanking` for `buildDecisionesDashboard`; compose the 3 layers; keep `<h1>Decisiones</h1>`, direct render, empty-state branch. The existing `ProfitabilitySummary` / `ProfitabilityTable` may be retired or reused inside `LowestMarginOrders`.

**Unchanged (reused as-is)**
- `app/domain/decisiones.ts` (`buildProfitabilityRanking`), `app/domain/finanzas.ts` (paid/pending convention reference), `app/domain/inventory.ts` (`buildInventorySummary`), `app/components/inventario/stock-badge.tsx`, `app/seed/constants.ts` (`ANCHOR_ISO`, `DAY_MS`, `WINDOW_DAYS`).

## ADR-style decisions

| # | Decision | Rationale | Rejected alternative |
|---|----------|-----------|----------------------|
| 1 | Custom inline SVG primitives, no chart lib | jsdom-testable, zero deps, full Tailwind theming, simple shapes | **Recharts** — `ResponsiveContainer` measures 0 under jsdom, needs dimension mocking, +bundle, fights strict TDD |
| 2 | Generic chart primitives in `app/components/charts/`, domain-agnostic | Reusable across screens; keeps formatting out of the drawing layer (screaming architecture) | Bespoke one-off chart per section — duplicated SVG math, harder to test |
| 3 | One orchestrator `buildDecisionesDashboard` composing small pure sub-helpers | Each aggregation unit-testable in isolation; matches `buildProfitabilityRanking`/`buildFinanceSummary` granularity; strict TDD | One monolithic builder — hard to unit-test edges; or scattered per-component data logic — leaks derivation into React |
| 4 | Reuse `buildProfitabilityRanking` ascending tail for lowest-margin | Helper already produces margin-sorted rows; no new logic/duplication | New parallel margin helper — duplication, drift risk |
| 5 | Period anchor = `ANCHOR_ISO` constant, split 10d/10d by `createdAt` | Deterministic vs wall-clock; matches seed window + Shopify/Lightspeed pattern | `Date.now()` anchor — non-deterministic, breaks tests |
| 6 | Formatting only at leaves; USD `formatMoney`, MN plain text | Consistent with entire salesops codebase; MN is not ISO currency | Formatting inside domain — pollutes pure helpers, un-reusable numbers |
| 7 | Preserve direct-render container (no `Form`/loader/`useNavigate`) | Sidesteps documented jsdom+undici `AbortSignal` gotcha; screen is read-only | RR7 loader/action — reintroduces the gotcha for zero benefit |
| 8 | Section headings avoid "decisiones" | Keeps `routes.test.tsx` `getByRole('heading', {name:/decisiones/i})` unambiguous (existing convention) | Free-form headings — breaks the route heading assertion |

## Checklist (design ready for tasks)

- [ ] Chart primitives are generic and import no `app/domain/*` type
- [ ] Every domain sub-helper is independently exported and unit-testable
- [ ] Every chart + section component has a colocated render test asserting structure/values
- [ ] Period split, per-order snapshot, orphan-skip, and empty-state rules specified
- [ ] No section heading contains "decisiones"
- [ ] No new dependency; no seed/data-model change
- [ ] Locked constraints honored (no meta/target, transport out of scope, lowest-margin not losses, consume ZELLE/EUR)

## Next step

Run `sdd-tasks` (after the spec is ready) to slice this file-by-file plan into ordered RED→GREEN work units.
