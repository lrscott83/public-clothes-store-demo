# Tasks: Pantalla — Dashboard de Finanzas (salesops-11-finanzas-dashboard, Task 11)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1000-1250 (neutral extraction touching 11 decisiones files + 1 new domain module w/ 6 helpers + tests + 7 finanzas components + tests + container rewrite) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Neutral extraction: `period-trend.ts` + `info-popover.tsx` relocation, decisiones re-exports/imports updated, full decisiones suite green (Phase 1) | PR 1 | Base: main. No new UI/behavior; pure refactor gate; ~150-220 lines |
| 2 | `finanzas-dashboard.ts` domain module + 6 helpers + full unit tests (Phase 2) | PR 2 | Base: PR 1 branch. No UI; depends on `period-trend.ts`; ~350-420 lines |
| 3 | 7 finanzas components + help-content + container rewrite + regression, remove `commission-summary` (Phases 3-4) | PR 3 | Base: PR 2 branch. Depends on Units 1-2; ~450-550 lines |

## Phase 1: Neutral extraction — `app/domain/period-trend.ts` + `app/components/shared/info-popover.tsx`

- [x] 1.1 RED: write/port `app/domain/__tests__/period-trend.test.ts` covering `splitByPeriod`, `buildKpiTrend`, `computeTrend`, `computeDelta` (moved from decisiones-dashboard tests)
- [x] 1.2 GREEN: create `app/domain/period-trend.ts` exporting `Trend`, `KpiTrend`, `PeriodSplit`, `splitByPeriod`, `buildKpiTrend`, `computeTrend`, `computeDelta`
- [x] 1.3 GREEN: refactor `app/domain/decisiones-dashboard.ts` to import from `period-trend.ts` and re-export the same public symbols (`splitByPeriod`, `PeriodSplit`, `Trend`, `KpiTrend`)
- [x] 1.4 VERIFY: `app/domain/__tests__/decisiones-dashboard.test.ts` stays green unmodified (regression gate)
- [x] 1.5 RED/GREEN: move `app/components/decisiones/info-popover.tsx` (+ `__tests__/info-popover.test.tsx`) to `app/components/shared/info-popover.tsx` (+ `__tests__/info-popover.test.tsx`); update imports in `app/components/decisiones/kpi-header.tsx` and `app/components/decisiones/sales-trend-section.tsx` (plus 7 additional decisiones importers discovered during apply: warehouse-sales, gestor-ranking, currency-mix, inventory-alerts, top-margin-products, stage-distribution, lowest-margin-orders)
- [x] 1.6 VERIFY: full decisiones component + domain suite green, `pnpm typecheck` clean, no remaining import of the old `decisiones/info-popover` path

## Phase 2: Finance domain — `app/domain/finanzas-dashboard.ts`

- [x] 2.1 RED: `buildFinanceKpiHeader` tests — windowed Σ `totalUSD`/`totalMN` qualifying, cobrado/pendiente state split, `comisionPendienteMN` from `buildFinanceSummary`, margen neto (Σ `totalUSD − cost − commissionUSD`), `prior === 0 → delta null`, MN NaN-guard (`qualifying()` + `?? 0`)
- [x] 2.2 GREEN: implement `buildFinanceKpiHeader` + private `qualifying`/`sumUSD`/`orderCostUSD`/`orderCommissionUSD`/`orderMarginUSD` helpers
- [x] 2.3 RED: `buildCashFlowTrend` tests — 20-day zero-filled buckets by `createdAt` offset from `generatedAt`, cobrado/pendiente split by `COBRADO_STATES`/`PENDIENTE_STATES`, oldest→newest order
- [x] 2.4 GREEN: implement `buildCashFlowTrend`
- [x] 2.5 RED: `buildCurrencyExposure` tests — grouping by `payment.method` incl. `otros` bucket, `revenueUSD`/`percent`/`isHardCurrency` flags
- [x] 2.6 GREEN: implement `buildCurrencyExposure`
- [x] 2.7 RED: `buildGestorCommissionCost` tests — per-gestor `revenueUSD`/`commissionEarnedMN`/`commissionPendingMN`, derived `commissionPaidMN = earned − pending`, derived `takeRatePercent`/`roi` with ÷0 guards, zero-order gestor row present
- [x] 2.8 GREEN: implement `buildGestorCommissionCost`
- [x] 2.9 RED: `buildWarehouseCashFlow` tests — per-warehouse cobrado/pendiente USD, zero-order warehouse still appears at 0, sorted desc
- [x] 2.10 GREEN: implement `buildWarehouseCashFlow`
- [x] 2.11 RED: `buildFinanceDashboard` orchestrator tests — composes `buildFinanceSummary` unchanged + own helpers into `FinanceDashboardView`, `hasData` false only when every order is `creado`/seed empty, frozen `exchangeRateSnapshot.usdToMn` immutability against live-rate edits
- [x] 2.12 GREEN: implement `buildFinanceDashboard` composing all sub-helpers
- [x] 2.13 VERIFY: `pnpm test app/domain/__tests__/finanzas-dashboard.test.ts` green, `pnpm typecheck` clean, no import from `decisiones-dashboard.ts`

## Phase 3: Finance components — `app/components/finanzas/`

- [x] 3.1 RED/GREEN: `help-content.ts` exporting `FINANZAS_HELP` (cobrado-proxy, liquidado-MN, comisión-pagada, tendencia-cobros caveat copy per Decision 4); no test needed (pure data)
- [x] 3.2 RED/GREEN + VERIFY: `finance-kpi-header.tsx` (5× `StatTile`, `positiveIsGood={false}` on comisión pendiente/pendiente) + render test
- [x] 3.3 RED/GREEN + VERIFY: `cash-flow-trend-section.tsx` (single `AreaTrend` + local cobrado/pendiente toggle, no `SeedState` re-read) + render test asserting one `<svg>`/polyline and toggle switch
- [x] 3.4 RED/GREEN + VERIFY: `commission-liability-donut.tsx` (`DonutChart`, pagada vs pendiente MN) + render test
- [x] 3.5 RED/GREEN + VERIFY: `revenue-by-state-bars.tsx` (`BarChart`, revenueUSD per state) + render test
- [x] 3.6 RED/GREEN + VERIFY: `currency-exposure-donut.tsx` (`DonutChart`, hard vs local share) + render test
- [x] 3.7 RED/GREEN + VERIFY: `gestor-commission-table.tsx` (ingreso/devengada/pagada/pendiente/take-rate/ROI columns) + render test
- [x] 3.8 RED/GREEN + VERIFY: `warehouse-cash-flow.tsx` (cobrado/pendiente per warehouse) + render test
- [x] 3.9 Delete `app/components/finanzas/commission-summary.tsx` + `__tests__/commission-summary.test.tsx` (superseded by 3.2 + 3.4)

## Phase 4: Container rewrite + regression — `app/routes/finanzas.tsx`

- [x] 4.1 RED: near-total rewrite of `app/routes/__tests__/finanzas.test.tsx` — single `<h1>Finanzas</h1>`, all 5 KPI tiles + 4 visuals + 3 blocks present, empty-state path (only `creado` orders), no `<form>`/mutating button (keep assertion, adjust for toggle/InfoPopover buttons), remove old commission-table assertions
- [x] 4.2 GREEN: rewrite `app/routes/finanzas.tsx` to `useState(() => buildFinanceDashboard(loadSeedState()))`, direct render of 3 layers, empty-state branch, remove `commission-summary` import
- [x] 4.3 VERIFY: `app/routes/__tests__/finanzas.test.tsx` green

## Verification

- [x] 5.1 `pnpm test` — full suite green, zero console warnings (67 files, 454 tests)
- [x] 5.2 `pnpm typecheck` — clean, zero errors
- [x] 5.3 Confirm no `app/components/finanzas/*` or `app/domain/finanzas-dashboard.ts` imports `decisiones-dashboard.ts` or `app/components/decisiones/*`
- [x] 5.4 Confirm no chart primitive imports `app/domain/*`; no new dependency added
- [x] 5.5 Locked constraints honored: no goal/gauge/semáforo, no Gross/Net/Fees model, "cobrado" copy stays a state-proxy caveat, no mutation affordance
