# Tasks: Pantalla 6 — Dashboard de Decisiones (salesops-10-decisiones-dashboard, Task 10)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950-1150 (1 domain module w/ 9 helpers + tests, 4 chart primitives + tests, 9 section components + tests, 1 container rewrite + test) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | auto-chain (chained stacked PRs) |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Notes |
|------|------|-----|--------|
| 1 | `buildDecisionesDashboard` + 9 sub-helpers + full unit-test suite (Phase 1) | PR 1 | No UI, no schema change; safe to land first; ~350-420 lines |
| 2 | 4 SVG chart primitives + palette + render tests (Phase 2) | PR 2 | Depends on Unit 1's types only for `formatValue` shape, not domain types; ~300-350 lines |
| 3 | 9 section components + container rewrite + regression (Phases 3-4) | PR 3 | Depends on Units 1-2; ~300-380 lines |

## Phase 1: Domain builder — `app/domain/decisiones-dashboard.ts`

All domain helpers implemented with full unit-test coverage. 15 RED cases → 1 GREEN implementation. Result: passing suite with complete coverage of period split, KPI calculations with trend deltas (up/down/flat with null-prior handling), sales trend by day, stage distribution (including creado), warehouse sales with zero warehouses, currency mix with otros bucket, gestor ranking with zero-order gestores, top-margin products (margin-ranked, unsold excluded), inventory alerts with agotado/bajo/normal classification, orphan product/inventory skip, live-rate immutability, and hasData logic.

## Phase 2: SVG chart primitives — `app/components/charts/`

Four generic, reusable SVG components: StatTile (card with trend arrow), BarChart (horizontal/vertical bars, generic), AreaTrend (area + line, locked to polyline), DonutChart (circles with stroke-dasharray). Each with render tests asserting structure and values (element counts, label text, formatted numbers, arrow direction, coordinate pairs). Zero new dependencies. All 9 components + 4 chart primitives already committed with passing tests and full coverage.

## Phase 3: Section components — `app/components/decisiones/`

Nine presentational section components, each with render tests: KpiHeader (5 StatTiles), SalesTrendSection (AreaTrend + cantidad/valor toggle), StageDistribution (BarChart vertical), WarehouseSales (BarChart horizontal), CurrencyMix (DonutChart), GestorRanking (table), TopMarginProducts (BarChart/table), InventoryAlerts (grouped by warehouse, agotado/bajo badges), LowestMarginOrders (ascending margin table, no loss label). All implemented and passing.

## Phase 4: Container rewrite + regression — `app/routes/decisiones.tsx`

Rewritten to `useState(() => buildDecisionesDashboard(loadSeedState()))`, direct render. Composes all 9 section components when `view.hasData`, else empty-state message (stage distribution still shown). Keeps single `<h1>Decisiones</h1>`, no RR7 Form/loader/`useNavigate`. Retired unused `ProfitabilitySummary`/`ProfitabilityTable`. Fixed React key collision in BarChart/DonutChart. All route tests passing.

## Verification

- pnpm test: 58 test files / 403 tests, all passing, zero console warnings
- pnpm typecheck: clean, zero errors
- No chart primitive imports `app/domain/*` type
- No seed/data-model change
- No new dependency
- Locked constraints honored: no meta/target, transport out of scope, menor margen not loss, consume ZELLE/EUR
