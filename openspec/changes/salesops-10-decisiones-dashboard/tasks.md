# Tasks: Pantalla 6 — Dashboard de Decisiones (salesops-10-decisiones-dashboard, Task 10)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950-1150 (1 domain module w/ 9 helpers + tests, 4 chart primitives + tests, 9 section components + tests, 1 container rewrite + test) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 domain, PR 2 chart primitives, PR 3 section components + container |
| Delivery strategy | ask-on-risk (pending orchestrator confirmation) |
| Chain strategy | pending (ask user: stacked-to-main vs feature-branch-chain) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `buildDecisionesDashboard` + 9 sub-helpers + full unit-test suite (Phase 1) | PR 1 | No UI, no schema change; safe to land first; ~350-420 lines |
| 2 | 4 SVG chart primitives + palette + render tests (Phase 2) | PR 2 | Depends on Unit 1's types only for `formatValue` shape, not domain types; ~300-350 lines |
| 3 | 9 section components + container rewrite + regression (Phases 3-4) | PR 3 | Depends on Units 1-2; ~300-380 lines |

If `feature-branch-chain`: PR 1 base = tracker/feature branch; PR 2 base = PR 1 branch; PR 3 base = PR 2 branch. If `stacked-to-main`: each PR targets `main` in order, merged before the next starts.

## Phase 1: Domain builder — `app/domain/decisiones-dashboard.ts`

- [x] 1.1 RED — create `app/domain/__tests__/decisiones-dashboard.test.ts`: `splitByPeriod` case — order 5 days before `generatedAt` → current window; order 15 days before → prior window; anchor is `state.generatedAt`, not wall clock. Run `pnpm test`, confirm failing (module missing).
- [x] 1.2 RED (same file) — `buildKpiHeader` case: 2 qualifying orders (`totalUSD:500/300`, `commissionMN:3000/1000`, `usdToMn:40`, item cost `200/100`) → `Ventas:800`, `Margen:400`, `Pedidos:2`, `AOV:400`. Confirm failing.
- [x] 1.3 RED (same file) — `buildKpiHeader` delta case: prior-window value `0`, current `500` → trend `up`, no `Infinity`/`NaN`; both windows `0` → trend `flat`; normal prior>0 → numeric delta. Confirm failing.
- [x] 1.4 RED (same file) — `buildKpiHeader` "Comisión pendiente" case: one `verificado` unpaid (`commissionMN:1000`), one `entregado` unpaid (`commissionMN:2000`), one `comision_pagada` (`commissionMN:3000`) → pending total `3000` (paid excluded). Confirm failing.
- [x] 1.5 RED (same file) — `buildSalesTrend` case: 20-day window, one day with zero qualifying orders → appears as `{count:0, valueUSD:0}`, not omitted; toggle-relevant series (`count` and `valueUSD`) both present per point. Confirm failing.
- [x] 1.6 RED (same file) — `buildStageDistribution` case: orders only in `creado` and `entregado` → exactly 5 entries in fixed order `creado→verificado→transportando→entregado→comision_pagada`, zero-count states included, `creado` orders counted here (unlike other aggregations). Confirm failing.
- [x] 1.7 RED (same file) — `buildWarehouseSales` case: 3 warehouses, qualifying orders for only 2 → all 3 appear, zero-sale warehouse shows `revenueUSD:0, count:0`. Confirm failing.
- [x] 1.8 RED (same file) — `buildCurrencyMix` case: 10 orders (4 USD/3 MN/2 ZELLE/1 EUR) → 4 buckets with correct counts, `USD` share `40%`; unrecognized method (e.g. `CRYPTO`) → grouped into `otros`, no throw. Confirm failing.
- [x] 1.9 RED (same file) — `buildGestorRanking` case: gestor `g1` one `verificado` unpaid order (`totalUSD:400, commissionMN:800`) → row `revenueUSD:400, aov:400, commissionEarnedMN:800, commissionPendingMN:800`; gestor with zero orders → row of all zeros, not omitted; rows sorted desc by `revenueUSD`. Confirm failing.
- [x] 1.10 RED (same file) — `buildTopMarginProducts` case: product `p1` (`costUSD:10`) in two qualifying lines (`qty:2,price:25` and `qty:1,price:30`) → aggregate margin `50`; product with zero qualifying sales → excluded (not zero-padded, unlike warehouse/gestor). Confirm failing.
- [x] 1.11 RED (same file) — `buildInventoryAlerts` case: `quantity:0` → `agotado`; `quantity:2` → `bajo`; `quantity:10` → excluded (normal); orphan `productId` → skipped without throw; grouped by `warehouseId`. Confirm failing.
- [x] 1.12 RED (same file) — orphan `productId` in margin/cost aggregation (KPIs and top-products) contributes `0`, no throw, rest of order/other orders still aggregated. Confirm failing.
- [x] 1.13 RED (same file) — live-rate regression: order's `exchangeRateSnapshot.usdToMn:40` frozen; mutating `state.exchangeRates.usdToMn` to `45` after the fact does not change that order's contribution to any KPI. Confirm failing.
- [x] 1.14 RED (same file) — `hasData` case: `SeedState.orders` all `creado` → `buildDecisionesDashboard(state).hasData === false`; at least one `verificado`+ order → `hasData === true`. Confirm failing.
- [x] 1.15 GREEN — implement `app/domain/decisiones-dashboard.ts`: export `DashboardView` + all sub-view types, `buildDecisionesDashboard(state: SeedState): DashboardView` composing the 9 sub-helpers (all individually exported for direct testing), reuse `buildProfitabilityRanking` (ascending tail) for `lowestMargin` and `buildInventorySummary` inside `buildInventoryAlerts`. Anchor = `state.generatedAt`/`ANCHOR_ISO`+`DAY_MS` from `app/seed/constants.ts`. Run `pnpm test`, confirm 1.1-1.14 passing.

## Phase 2: SVG chart primitives — `app/components/charts/`

- [x] 2.1 RED — create `app/components/charts/palette.ts` consumer test inline in `stat-tile.test.tsx` setup only if needed; otherwise treat palette as a plain data module (no test required, but confirm it exports an ordered Tailwind class-pair array before 2.3).
- [x] 2.2 RED — create `app/components/charts/__tests__/stat-tile.test.tsx`: `<StatTile label value delta positiveIsGood/>` — label + value text present; `delta > 0` + `positiveIsGood:true` → up arrow `▲` + green class; `delta > 0` + `positiveIsGood:false` → up arrow + red class; `delta === null` → no arrow, "—" shown. Run `pnpm test`, confirm failing (module missing).
- [x] 2.3 GREEN — implement `app/components/charts/stat-tile.tsx` per design prop contract. Run `pnpm test`, confirm 2.2 passing.
- [x] 2.4 RED — create `app/components/charts/__tests__/bar-chart.test.tsx`: `<BarChart bars ariaLabel/>` — `querySelectorAll('rect').length === bars.length`; each bar label present via `getByText`; formatted values present when `formatValue` passed; `bars=[]` → svg shell renders, zero `rect`, no throw. Run `pnpm test`, confirm failing.
- [x] 2.5 GREEN — implement `app/components/charts/bar-chart.tsx` (horizontal/vertical orientation, generic, no domain import). Run `pnpm test`, confirm 2.4 passing.
- [x] 2.6 RED — create `app/components/charts/__tests__/area-trend.test.tsx`: LOCK the coordinate mechanism to a single `<polyline points="x1,y1 x2,y2 ...">` (no separate `<path d>` area fill) — assert `points` attribute splits into exactly `points.length` coordinate pairs; assert first/last pair reflects min/max scaling; `points=[]` → no `polyline`, no throw. Run `pnpm test`, confirm failing.
- [x] 2.7 GREEN — implement `app/components/charts/area-trend.tsx` using the locked `polyline` mechanism only. Run `pnpm test`, confirm 2.6 passing.
- [x] 2.8 RED — create `app/components/charts/__tests__/donut-chart.test.tsx`: LOCK the arc mechanism to one `<circle>` per slice using `stroke-dasharray`/`stroke-dashoffset` (no arc `<path d>` math) — assert `querySelectorAll('circle').length === slices.length`; legend labels via `getByText`; percent text sums to `100`; single slice → full-ring `circle` with `stroke-dasharray` covering full circumference; `slices=[]` → no `circle`, no throw. Run `pnpm test`, confirm failing.
- [x] 2.9 GREEN — implement `app/components/charts/donut-chart.tsx` using the locked `circle`+`stroke-dasharray` mechanism only. Run `pnpm test`, confirm 2.8 passing.
- [x] 2.10 VERIFY — confirm none of the 4 chart primitives import any `app/domain/*` type (design checklist item).

## Phase 3: Section components — `app/components/decisiones/`

- [x] 3.1 RED — create `app/components/decisiones/__tests__/kpi-header.test.tsx`: `<KpiHeader kpis={KpiHeaderView}/>` renders exactly 5 `StatTile`s in fixed order Ventas/Margen/Pedidos+AOV/Comisión pendiente/Cobrado vs pendiente; USD figures match `formatMoney` regex; MN figure is plain `{v} MN` text, not `formatMoney`. Confirm failing.
- [x] 3.2 GREEN — implement `app/components/decisiones/kpi-header.tsx`. Confirm 3.1 passing.
- [x] 3.3 RED — create `app/components/decisiones/__tests__/sales-trend-section.test.tsx`: default renders "valor" (or documented default) series via `AreaTrend`; heading "Tendencia de ventas (20 días)" does not contain "decisiones"; clicking the "cantidad" toggle switches the rendered series without re-reading `SeedState` (assert via prop-only re-render, no new data fetch call). Confirm failing.
- [x] 3.4 GREEN — implement `app/components/decisiones/sales-trend-section.tsx` (`useState<'cantidad'|'valor'>`). Confirm 3.3 passing.
- [x] 3.5 RED — create `app/components/decisiones/__tests__/stage-distribution.test.tsx`: 5 bars render via `BarChart`, one per `OrderState`, zero-count states present; heading/subtitle contains no funnel/conversion language ("% de conversión", "tasa de abandono" absent), no "decisiones". Confirm failing.
- [x] 3.6 GREEN — implement `app/components/decisiones/stage-distribution.tsx`. Confirm 3.5 passing.
- [x] 3.7 RED — create `app/components/decisiones/__tests__/warehouse-sales.test.tsx`: one bar per warehouse via `BarChart`, zero-sale warehouse included with `$0.00`; heading has no "decisiones". Confirm failing.
- [x] 3.8 GREEN — implement `app/components/decisiones/warehouse-sales.tsx`. Confirm 3.7 passing.
- [x] 3.9 RED — create `app/components/decisiones/__tests__/currency-mix.test.tsx`: one slice per method via `DonutChart`, legend % via `getByText`, `otros` bucket rendered when present; heading has no "decisiones". Confirm failing.
- [x] 3.10 GREEN — implement `app/components/decisiones/currency-mix.tsx`. Confirm 3.9 passing.
- [x] 3.11 RED — create `app/components/decisiones/__tests__/gestor-ranking.test.tsx`: one row per gestor, `revenueUSD`/`aov` via `formatMoney`, `commissionEarnedMN`/`commissionPendingMN` as plain `{v} MN` text; zero-order gestor row present; heading has no "decisiones". Confirm failing.
- [x] 3.12 GREEN — implement `app/components/decisiones/gestor-ranking.tsx`. Confirm 3.11 passing.
- [x] 3.13 RED — create `app/components/decisiones/__tests__/top-margin-products.test.tsx`: one row/bar per ranked product, margin via `formatMoney`, sorted desc, unsold product absent; heading has no "decisiones". Confirm failing.
- [x] 3.14 GREEN — implement `app/components/decisiones/top-margin-products.tsx`. Confirm 3.13 passing.
- [x] 3.15 RED — create `app/components/decisiones/__tests__/inventory-alerts.test.tsx`: rows grouped by warehouse, `agotado`/`bajo` rows only (reuse `StockBadge`), normal-quantity entries absent; heading has no "decisiones". Confirm failing.
- [x] 3.16 GREEN — implement `app/components/decisiones/inventory-alerts.tsx`. Confirm 3.15 passing. **Deviation**: `StockBadge` only models the binary `disponible`/`agotado` `StockStatus`, which cannot express the `bajo` alert level — implemented a local two-level pill (`agotado`/`bajo`) mirroring the same visual convention instead of literally reusing `StockBadge`.
- [x] 3.17 RED — create `app/components/decisiones/__tests__/lowest-margin-orders.test.tsx`: rows render ascending by `marginUSD` (lowest first) from `ProfitabilityRow[]` input unchanged; no "pérdida"/"loss" text or styling even when `isLoss:true`; heading "Pedidos de menor margen" has no "decisiones". Confirm failing.
- [x] 3.18 GREEN — implement `app/components/decisiones/lowest-margin-orders.tsx` (new leaf markup, ascending order preserved from input, no loss-tag). Confirm 3.17 passing. **Deviation**: did not literally reuse `ProfitabilityTable` markup (that component + `ProfitabilitySummary` were retired — see Phase 4 note — since neither is referenced by any screen after the rewrite); wrote a small dedicated table instead, per design's "may be retired or reused" wording.

## Phase 4: Container rewrite + regression — `app/routes/decisiones.tsx`

- [x] 4.1 RED — update `app/routes/__tests__/decisiones.test.tsx`: `render(<Decisiones/>)` direct (no router stub) — exactly one `<h1>Decisiones</h1>`; when `verificado`+ orders exist, all 5 KPI tiles + 4 Layer-2 visuals + Layer-3 blocks render. Confirm failing (still old `ProfitabilitySummary`/`ProfitabilityTable`-only render). **Deviation**: the spec's top-level scenario prose says "3 actionable blocks" for Layer 3, but the spec's own per-requirement enumeration (Ranking de gestores / Top productos por margen / Alertas de inventario / Pedidos de menor margen) and the design's component tree both describe 4 distinct Layer-3 components, each with its own ADDED Requirement, heading, and behavior. Implemented all 4 (matches Phase 3's 9-component total: 1 KPI header + 4 Layer-2 visuals + 4 Layer-3 blocks) rather than dropping one to match the imprecise top-level count — no requirement content was omitted.
- [x] 4.2 RED (same file) — heading-uniqueness case: `getAllByRole('heading')` — only the `<h1>` matches `/decisiones/i`, no section subheading contains "decisiones". Confirm failing.
- [x] 4.3 RED (same file) — empty-state case: seed stubbed to only `creado` orders → single `<h1>` still renders, empty-state message shown instead of KPI header + sales-trend/warehouse/currency-mix/gestor/margin/alerts blocks; stage distribution still renders (exempted). Confirm failing.
- [x] 4.4 RED (same file) — no-mutation-affordance case: rendered output contains no `<form>`; cantidad/valor toggle button present but does not mutate `SeedState`. Confirm failing.
- [x] 4.5 RED (same file) — no-target case: rendered output contains no goal/objective/meta-compliance text. Confirm failing.
- [x] 4.6 GREEN — rewrite `app/routes/decisiones.tsx`: `useState(() => buildDecisionesDashboard(loadSeedState()))`, direct render, `<h1>Decisiones</h1>`, 3-layer responsive grid composing `KpiHeader`/`SalesTrendSection`/`StageDistribution`/`WarehouseSales`/`CurrencyMix`/`GestorRanking`/`TopMarginProducts`/`InventoryAlerts`/`LowestMarginOrders` when `view.hasData`, else empty-state message (stage distribution still shown per exemption); kept existing `meta()`. Run `pnpm test`, confirm 4.1-4.5 passing. Retired the now-unused `ProfitabilitySummary`/`ProfitabilityTable` components + tests (no longer referenced by any screen). Also fixed a latent React key-collision bug surfaced by real seed data during this integration (two different products/warehouses sharing a display-name string): `BarChart`/`DonutChart` (Phase 2, already committed) used `label` alone as the list key — changed to `${label}-${index}` in both; no prop-contract or test-assertion change, all Phase 2 render tests still pass unmodified.
- [x] 4.7 VERIFY — `app/routes/__tests__/routes.test.tsx` still passes: shared `{ path: '/decisiones', Component: Decisiones, heading: /decisiones/i }` entry resolves to a single unambiguous heading match.

## Verification

- [x] 5.1 Run full `pnpm test` (from `templates/apps/salesops-mvp`) — confirm all green, including all Phase 1-4 new suites and every prior salesops task's regression suite (seed-store, tablero, operador-*, tasas, inventario, finanzas). **Result: 58 test files / 398 tests, all passing, zero console warnings.**
- [x] 5.2 Run `pnpm --filter salesops-mvp typecheck` (or `pnpm typecheck` from the app dir) — confirm no type errors across new domain module, chart primitives, section components, and rewritten container. **Result: clean, zero errors.**
- [x] 5.3 Manual checklist confirmation: no chart primitive imports `app/domain/*` (verified via `rg`); no seed/data-model change made (verified via `git status`/`git diff --stat` on seed files and `package.json`/lockfile); no new dependency added; locked constraints honored (no meta/target — test 4.5; transport out of scope — untouched; "menor margen" not "loss" — test in 3.17/lowest-margin-orders; ZELLE/EUR consumed not seeded — `CurrencyMix` groups existing payment methods only).
