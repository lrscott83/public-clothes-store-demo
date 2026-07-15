# Tasks: Move margin/AOV from Decisiones to Finanzas

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450-550 (3 domain adds + 2 new components + wiring + 6 test files touched + 2 deletes + 2 component deletes) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Finanzas additions) → PR 2 (Decisiones removals + cleanup) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Finanzas domain + components + wiring (Phases 1-2) | PR 1 | Additive only; base = main (or tracker branch); does not break Decisiones yet |
| 2 | Decisiones removals + domain/decisiones.ts deletion + final gates (Phases 3-5) | PR 2 | Depends on PR 1 merged; base = PR 1 branch (feature-branch-chain) or main (stacked-to-main) |

## Phase 1: Finanzas Domain — Tests First (RED)

- [x] 1.1 In `templates/apps/salesops-mvp/app/domain/__tests__/finanzas-dashboard.test.ts`, add failing tests for `buildProductMargin`: aggregate margin sum, orphan-line skip (contributes 0, no throw), descending sort, zero-sale product excluded (not zero-padded). Covers spec scenario "Top productos por margen sorts descending and skips orphan references".
- [x] 1.2 Add failing tests for `buildLowMarginOrders`: ascending sort, deterministic tie-break `a.orderId.localeCompare(b.orderId)`, frozen-rate usage (`exchangeRateSnapshot.usdToMn`, ignores later `state.exchangeRates` edits), lean shape (no `marginPercent`/`isLoss`). Covers "Pedidos de menor margen sorts ascending..." and "Product margin and order margin use each order's frozen rate".
- [x] 1.3 Add failing tests for `aovUSD` in `buildFinanceKpiHeader`: count-guard (0 qualifying orders → `aovUSD.current = 0`, never `NaN`/`Infinity`), current-vs-prior 10-day window trend, 0-prior/>0-current → "up" trend. Covers "AOV is guarded against zero orders" and "Five tiles render with a safe trend".
- [x] 1.4 Add/extend a composition test asserting `buildFinanceDashboard` exposes `productMargin` and `lowMarginOrders` view models and that `aovUSD` is the 5th (last) tile on `FinanceKpiHeaderView`.
- [x] 1.5 Run `vitest run` from `templates/apps/salesops-mvp/` — confirm all new tests fail (RED).

## Phase 2: Finanzas Domain + Components — Implementation (GREEN)

- [x] 2.1 In `templates/apps/salesops-mvp/app/domain/finanzas-dashboard.ts`, add `buildProductMargin(state): ProductMarginView` with `ProductMarginRow {productId, name, marginUSD}`, using existing private `qualifying`/order-line helpers, orphan-skip via `continue`, sort descending.
- [x] 2.2 In the same file, add `buildLowMarginOrders(state): LowMarginOrdersView` with `OrderMarginRow {orderId, clientName, revenueUSD, marginUSD}` (no `marginPercent`/`isLoss`), reusing private `orderCostUSD`/`orderCommissionUSD`/`orderMarginUSD`, ascending sort with tie-break.
- [x] 2.3 In `buildFinanceKpiHeader`, add private `pedidosCurrent`/`pedidosPrior` counts and append `aovUSD: KpiTrend` as the 5th (last) field on `FinanceKpiHeaderView`, count-guarded (`pedidosCurrent > 0 ? facturadoCurrent / pedidosCurrent : 0`).
- [x] 2.4 Wire `productMargin` and `lowMarginOrders` into `FinanceDashboardView` and `buildFinanceDashboard`; keep `hasData` gate unchanged.
- [x] 2.5 Run `vitest run` — confirm Phase 1 domain tests now pass (GREEN).
- [x] 2.6 Write failing component test `templates/apps/salesops-mvp/app/components/finanzas/__tests__/product-margin-bars.test.tsx`, then create `product-margin-bars.tsx` (mirror `revenue-by-state-bars.tsx`; `TOP_N=8`, `MAX_LABEL=22`, truncate; heading "Top productos por margen"; uses `FINANZAS_HELP.topProductosMargen`; props `{productMargin: ProductMarginView}`).
- [x] 2.7 Write failing component test `templates/apps/salesops-mvp/app/components/finanzas/__tests__/low-margin-orders.test.tsx`, then create `low-margin-orders.tsx` (mirror deleted `lowest-margin-orders.tsx`; columns Cliente/Ingresos/Margen; no pérdida/loss label; heading "Pedidos de menor margen"; uses `FINANZAS_HELP.pedidosMenorMargen`; props `{lowMarginOrders: LowMarginOrdersView}`).
- [x] 2.8 Update `templates/apps/salesops-mvp/app/components/finanzas/finance-kpi-header.test.tsx`: change `toBe(4)` → `toBe(5)`, add `aovUSD` fixture, assert "Ticket promedio" tile renders last.
- [x] 2.9 Update `templates/apps/salesops-mvp/app/components/finanzas/finance-kpi-header.tsx`: append 5th `StatTile` label "Ticket promedio", value `formatMoney(aovUSD.current)`, help `FINANZAS_HELP.ticketPromedio`; keep grid `lg:grid-cols-4` (5th wraps); update docstring 4→5.
- [x] 2.10 Add 3 entries to `templates/apps/salesops-mvp/app/components/finanzas/help-content.ts`: `ticketPromedio`, `topProductosMargen`, `pedidosMenorMargen` — voseo, "dinero" (never "plata"), no Gross/Net/Fees/refunds, no "por cobrar". Covers "New help entries avoid banned vocabulary".
- [x] 2.11 Update `templates/apps/salesops-mvp/app/routes/finanzas.tsx`: import and render `ProductMarginBars` + `LowMarginOrders` inside the existing `view.hasData` Layer-3 grid.
- [x] 2.12 Update/add `templates/apps/salesops-mvp/app/routes/__tests__/finanzas.test.tsx` (or equivalent route test): assert the 2 new headings render, "Ticket promedio" tile renders, and both blocks are absent in the empty-state.
- [x] 2.13 Run `vitest run` — confirm all Phase 2 tests pass (GREEN).

## Phase 3: Decisiones Removals — Tests First (RED/trim)

- [x] 3.1 In `templates/apps/salesops-mvp/app/domain/__tests__/decisiones-dashboard.test.ts`, remove the `buildTopMarginProducts` import, its describe block, the orphan-top-margin test, the `aovUSD` assertion in `buildKpiHeader` tests, and the `topMargin`/`lowestMargin` assertions in dashboard-composition tests (keep `pedidos`/`pedidosCurrent`/`pedidosPrior` tests).
- [x] 3.2 In `templates/apps/salesops-mvp/app/components/decisiones/kpi-header.test.tsx`, remove the `aovUSD` fixture and the AOV-sublabel test.
- [x] 3.3 In `templates/apps/salesops-mvp/app/components/decisiones/decisiones.test.tsx` (or route-level equivalent), remove the 2 heading assertions for top-margin-products and lowest-margin-orders.
- [x] 3.4 Run `vitest run` — confirm the trimmed decisiones tests still describe the reduced surface (some existing implementation tests should now be RED against the not-yet-trimmed source, or already pass if source trimmed later — verify current pass/fail baseline before Phase 4 edits).

## Phase 4: Decisiones Removals — Implementation

- [x] 4.1 In `templates/apps/salesops-mvp/app/domain/decisiones-dashboard.ts`, drop the `./decisiones` import; delete `aovUSD` from `KpiHeaderView` and `aovCurrent`/`aovPrior`/`aovUSD` from `buildKpiHeader` (keep `pedidos` + `pedidosCurrent`/`pedidosPrior`).
- [x] 4.2 In the same file, delete `buildTopMarginProducts` + `TopMarginRow`/`TopMarginView`, and delete `topMargin`/`lowestMargin` fields from `DashboardView` and from `buildDecisionesDashboard`.
- [x] 4.3 In `templates/apps/salesops-mvp/app/components/decisiones/kpi-header.tsx`, delete the AOV sublabel line.
- [x] 4.4 In `templates/apps/salesops-mvp/app/components/decisiones/help-content.ts`, reword the `pedidos` help entry (drop AOV mention) and delete `topProductosMargen`/`pedidosMenorMargen` entries.
- [x] 4.5 In the Decisiones route file (`templates/apps/salesops-mvp/app/routes/decisiones.tsx` or equivalent), delete the `TopMarginProducts`/`LowestMarginOrders` imports and their JSX usages.
- [x] 4.6 Delete `templates/apps/salesops-mvp/app/components/decisiones/top-margin-products.tsx` and `templates/apps/salesops-mvp/app/components/decisiones/lowest-margin-orders.tsx`, plus their test files.
- [x] 4.7 Run `vitest run` — confirm all decisiones tests are GREEN with the reduced surface.

## Phase 5: Delete domain/decisiones.ts + Final Gates

- [x] 5.1 Grep the repo for remaining imports of `./decisiones`, `TopMarginView`, `ProfitabilityRow`, `ProfitabilityView`, `buildProfitabilityRanking` to confirm zero consumers remain outside the file itself.
- [x] 5.2 Delete `templates/apps/salesops-mvp/app/domain/decisiones.ts` and `templates/apps/salesops-mvp/app/domain/__tests__/decisiones.test.ts`.
- [x] 5.3 Run full `vitest run` from `templates/apps/salesops-mvp/` — confirm all tests pass.
- [x] 5.4 Run `react-router typegen && tsc` from `templates/apps/salesops-mvp/` — confirm exit code 0.
- [x] 5.5 Re-run the Phase 5.1 grep to confirm zero dangling references after deletion (final check).
