# Tasks: Move margin/AOV from Decisiones to Finanzas — ALL COMPLETE

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450-550 (3 domain adds + 2 new components + wiring + 6 test files touched + 2 deletes + 2 component deletes) |
| Actual changed lines | ~387 insertions / 554 deletions, 21 files |
| 400-line budget risk | High (accepted via size:exception, single PR) |
| Chained PRs recommended | No (delivered single PR, size:exception) |
| Delivery strategy | ask-on-risk |

## Suggested Work Units

| Unit | Goal | Status | Notes |
|------|------|--------|-------|
| 1 | Finanzas domain + components + wiring (Phases 1-2) | COMPLETE | All additive work done; no Decisiones breaking changes |
| 2 | Decisiones removals + domain/decisiones.ts deletion + final gates (Phases 3-5) | COMPLETE | All removal + deletion complete; all tests GREEN |

## Phase 1: Finanzas Domain — Tests First (RED) — COMPLETE

- [x] 1.1 Added failing tests for `buildProductMargin`: aggregate margin sum, orphan-line skip (contributes 0, no throw), descending sort, zero-sale product excluded (not zero-padded). Spec scenario "Top productos por margen sorts descending and skips orphan references".
- [x] 1.2 Added failing tests for `buildLowMarginOrders`: ascending sort, deterministic tie-break `a.orderId.localeCompare(b.orderId)`, frozen-rate usage (`exchangeRateSnapshot.usdToMn`, ignores later `state.exchangeRates` edits), lean shape (no `marginPercent`/`isLoss`). Spec scenario "Pedidos de menor margen sorts ascending..." and "Product margin and order margin use each order's frozen rate".
- [x] 1.3 Added failing tests for `aovUSD` in `buildFinanceKpiHeader`: count-guard (0 qualifying orders → `aovUSD.current = 0`, never `NaN`/`Infinity`), current-vs-prior 10-day window trend, 0-prior/>0-current → "up" trend. Spec scenarios "AOV is guarded against zero orders" and "Five tiles render with a safe trend".
- [x] 1.4 Added composition test asserting `buildFinanceDashboard` exposes `productMargin` and `lowMarginOrders` view models and that `aovUSD` is the 5th (last) tile on `FinanceKpiHeaderView`.
- [x] 1.5 Confirmed all new tests RED before Phase 2.

## Phase 2: Finanzas Domain + Components — Implementation (GREEN) — COMPLETE

- [x] 2.1 Added `buildProductMargin(state): ProductMarginView` with `ProductMarginRow {productId, name, marginUSD}`, using existing private `qualifying`/order-line helpers, orphan-skip via `continue`, sort descending.
- [x] 2.2 Added `buildLowMarginOrders(state): LowMarginOrdersView` with `OrderMarginRow {orderId, clientName, revenueUSD, marginUSD}` (no `marginPercent`/`isLoss`), reusing private `orderCostUSD`/`orderCommissionUSD`/`orderMarginUSD`, ascending sort with tie-break.
- [x] 2.3 Added private `pedidosCurrent`/`pedidosPrior` counts in `buildFinanceKpiHeader` and appended `aovUSD: KpiTrend` as the 5th (last) field on `FinanceKpiHeaderView`, count-guarded (`pedidosCurrent > 0 ? facturadoCurrent / pedidosCurrent : 0`).
- [x] 2.4 Wired `productMargin` and `lowMarginOrders` into `FinanceDashboardView` and `buildFinanceDashboard`; `hasData` gate unchanged.
- [x] 2.5 Confirmed Phase 1 domain tests GREEN.
- [x] 2.6 Created component `product-margin-bars.tsx` → `ProductMarginBars` (mirrors `revenue-by-state-bars.tsx`; `TOP_N=8`, `MAX_LABEL=22`, truncate; heading "Top productos por margen"; uses `FINANZAS_HELP.topProductosMargen`; props `{productMargin: ProductMarginView}`).
- [x] 2.7 Created component `low-margin-orders.tsx` → `LowMarginOrders` (mirrors deleted `lowest-margin-orders.tsx`; columns Cliente/Ingresos/Margen; no pérdida/loss label; heading "Pedidos de menor margen"; uses `FINANZAS_HELP.pedidosMenorMargen`; props `{lowMarginOrders: LowMarginOrdersView}`).
- [x] 2.8 Updated `finance-kpi-header.test.tsx`: changed `toBe(4)` → `toBe(5)`, added `aovUSD` fixture, asserted "Ticket promedio" tile renders last.
- [x] 2.9 Updated `finance-kpi-header.tsx`: appended 5th `StatTile` label "Ticket promedio", value `formatMoney(aovUSD.current)`, help `FINANZAS_HELP.ticketPromedio`; kept grid `lg:grid-cols-4` (5th wraps); updated docstring 4→5.
- [x] 2.10 Added 3 entries to `help-content.ts`: `ticketPromedio`, `topProductosMargen`, `pedidosMenorMargen` — voseo, "dinero" (never "plata"), no Gross/Net/Fees/refunds, no "por cobrar". Covers "New help entries avoid banned vocabulary".
- [x] 2.11 Updated `routes/finanzas.tsx`: imported and rendered `ProductMarginBars` + `LowMarginOrders` inside the existing `view.hasData` Layer-3 grid.
- [x] 2.12 Updated `routes/__tests__/finanzas.test.tsx`: asserted the 2 new headings render, "Ticket promedio" tile renders, and both blocks are absent in the empty-state.
- [x] 2.13 Confirmed all Phase 2 tests GREEN.

## Phase 3: Decisiones Removals — Tests First (RED/trim) — COMPLETE

- [x] 3.1 Removed `buildTopMarginProducts` import, its describe block, orphan-top-margin test, `aovUSD` assertion in `buildKpiHeader` tests, and `topMargin`/`lowestMargin` assertions in dashboard-composition tests from `decisiones-dashboard.test.ts`. Kept `pedidos`/`pedidosCurrent`/`pedidosPrior` tests.
- [x] 3.2 Removed `aovUSD` fixture and AOV-sublabel test from `kpi-header.test.tsx`.
- [x] 3.3 Removed 2 heading assertions for top-margin-products and lowest-margin-orders from `decisiones.test.tsx`.
- [x] 3.4 Confirmed trimmed decisiones tests baseline before Phase 4.

## Phase 4: Decisiones Removals — Implementation — COMPLETE

- [x] 4.1 Dropped `./decisiones` import from `decisiones-dashboard.ts`; deleted `aovUSD` from `KpiHeaderView` and `aovCurrent`/`aovPrior`/`aovUSD` from `buildKpiHeader` (kept `pedidos` + `pedidosCurrent`/`pedidosPrior`).
- [x] 4.2 Deleted `buildTopMarginProducts` + `TopMarginRow`/`TopMarginView`, and deleted `topMargin`/`lowestMargin` fields from `DashboardView` and from `buildDecisionesDashboard`.
- [x] 4.3 Deleted the AOV sublabel line from `components/decisiones/kpi-header.tsx`.
- [x] 4.4 Reworded `pedidos` help entry (dropped AOV mention) and deleted `topProductosMargen`/`pedidosMenorMargen` entries from `help-content.ts`.
- [x] 4.5 Deleted `TopMarginProducts`/`LowestMarginOrders` imports and their JSX usages from `routes/decisiones.tsx`.
- [x] 4.6 Deleted `components/decisiones/top-margin-products.tsx`, `components/decisiones/lowest-margin-orders.tsx`, and their test files.
- [x] 4.7 Confirmed all decisiones tests GREEN with reduced surface.

## Phase 5: Delete domain/decisiones.ts + Final Gates — COMPLETE

- [x] 5.1 Grepped repo for remaining imports of `./decisiones`, `TopMarginView`, `ProfitabilityRow`, `ProfitabilityView`, `buildProfitabilityRanking` — confirmed zero consumers.
- [x] 5.2 Deleted `templates/apps/salesops-mvp/app/domain/decisiones.ts` and `templates/apps/salesops-mvp/app/domain/__tests__/decisiones.test.ts`.
- [x] 5.3 Full test run (`vitest run` from `templates/apps/salesops-mvp/`) — all tests PASS.
- [x] 5.4 Typecheck and build (`react-router typegen && tsc` from `templates/apps/salesops-mvp/`) — exit code 0.
- [x] 5.5 Re-ran Phase 5.1 grep — confirmed zero dangling references after deletion (final check).

## Implementation Summary

**Total changed files**: 21
**Total insertions**: ~387
**Total deletions**: ~554
**Delivery**: Single PR (size:exception accepted) on salesops-mvp branch

All phases complete. Zero test failures. Zero typecheck/build errors. All spec scenarios verified. All locked constraints honored.
