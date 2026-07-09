# Tasks: Pantalla 6 — Decisiones (salesops-08-decisiones, Task 8)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300-380 (1 domain helper + test, 2 presentational components + tests, 1 container rewrite + test) |
| 400-line budget risk | Medium (close to budget per design's own ~380 estimate) |
| Chained PRs recommended | No |
| Suggested split | Single PR, `size:exception` if diff lands 380-400+ |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Domain builder `buildProfitabilityRanking` (Phase 1) | No UI; safe to land first, zero schema changes |
| 2 | `ProfitabilitySummary` + `ProfitabilityTable` (Phase 2) | Depends on Unit 1's types only |
| 3 | `decisiones.tsx` container rewrite + regression (Phase 3) | Depends on Units 1-2 |

All units land in one PR (`size:exception` if diff approaches/exceeds 400 lines) — split shown only for internal sequencing.

## Phase 1: Domain builder — `app/domain/decisiones.ts`

- [x] 1.1 RED — create `app/domain/__tests__/decisiones.test.ts`: filter case — a `creado` order is excluded entirely from `rows`, `count`, and `totals`. Run `pnpm --filter salesops-mvp test`, confirm failing (module missing).
- [x] 1.2 RED (same file) — margin math case: `totalUSD:500`, `commissionMN:3000`, `exchangeRateSnapshot.usdToMn:40`, items summing `costUSD:200` → row `commissionUSD:75`, `marginUSD:225`. Confirm failing.
- [x] 1.3 RED (same file) — orphan-item case: an item's `productId` has no matching product → builder does not throw, contributes `0` to `costUSD`, rest of order's items still summed. Confirm failing.
- [x] 1.4 RED (same file) — LIVE-RATE regression (MANDATORY): `verificado` order with `exchangeRateSnapshot.usdToMn:40`, `commissionMN:3000` → mutate `state.exchangeRates.usdToMn` to `45` → rebuild ranking → row's `commissionUSD` still `75` and `marginUSD` unchanged. Confirm failing.
- [x] 1.5 RED (same file) — divide-by-zero defensive case: order with `exchangeRateSnapshot.usdToMn:0` (or missing) → builder does not throw, `commissionUSD` is `0`. Confirm failing.
- [x] 1.6 RED (same file) — sort + tie-break case: three orders with `marginUSD` `100`, `-20`, `300` → row order is `300,100,-20`; two equal-margin orders tie-break by `orderId.localeCompare`. Confirm failing.
- [x] 1.7 RED (same file) — loss-flag case: negative `marginUSD` → `isLoss:true`; zero/positive `marginUSD` → `isLoss:false`. Confirm failing.
- [x] 1.8 RED (same file) — grand totals case: rows with `marginUSD` `225` and `-20` → `totals.marginUSD === 205`; `totals.revenueUSD/costUSD/commissionUSD` likewise equal sums. `count` matches row count. Confirm failing.
- [x] 1.9 GREEN — implement `app/domain/decisiones.ts` per design: export `ProfitabilityRow`, `ProfitabilityTotals`, `ProfitabilityView`, `buildProfitabilityRanking(state: SeedState): ProfitabilityView`. Product join via `Map`, orphan-skip, `usdToMn>0 ? commissionMN/usdToMn : 0` guard, `exchangeRateSnapshot?.usdToMn`/`commissionMN ?? 0` optional-safe reads, filter `state !== 'creado'`, sort `b.marginUSD - a.marginUSD || a.orderId.localeCompare(b.orderId)`. Run vitest, confirm 1.1-1.8 passing.

## Phase 2: Presentational components

- [x] 2.1 RED — create `app/components/decisiones/__tests__/profitability-summary.test.tsx`: render `<ProfitabilitySummary totals={...} count={n}/>` — revenue/cost/commission/margin figures rendered via `formatMoney` pattern `^\$[\d,]+\.\d{2}$`; heading text does NOT contain "decisiones". Run vitest, confirm failing (module missing).
- [x] 2.2 RED (same file) — negative-total emphasis case: `totals.marginUSD < 0` renders a visible loss emphasis (e.g. distinct class/text) on the grand-total margin figure. Confirm failing.
- [x] 2.3 GREEN — create `app/components/decisiones/profitability-summary.tsx`: `ProfitabilitySummaryProps { totals: ProfitabilityTotals; count: number }`, h2 "Resumen de rentabilidad", all four figures through `formatMoney({locale:'en-US',currency:'USD'})`, loss-emphasis styling when `totals.marginUSD < 0`. Run vitest, confirm 2.1-2.2 passing.
- [x] 2.4 RED — create `app/components/decisiones/__tests__/profitability-table.test.tsx`: render `<ProfitabilityTable rows={[...]}/>` — one row per input row, each money cell matches `formatMoney` regex, heading does NOT contain "decisiones". Confirm failing.
- [x] 2.5 RED (same file) — loss-tag toggle case: row with `isLoss:true` renders a "Pérdida" tag inline; row with `isLoss:false` does not render the tag. Confirm failing.
- [x] 2.6 RED (same file) — empty-rows case: `rows={[]}` renders the table shell without throwing (container handles the true empty-state message, not this component). Confirm failing.
- [x] 2.7 GREEN — create `app/components/decisiones/profitability-table.tsx`: `ProfitabilityTableProps { rows: ProfitabilityRow[] }`, h2 "Ranking de rentabilidad de pedidos", table columns (order/client, revenue, cost, commission, margin, tag), inline "Pérdida" tag when `row.isLoss`. Run vitest, confirm 2.4-2.6 passing.

## Phase 3: Container wiring + regression

- [x] 3.1 RED — create `app/routes/__tests__/decisiones.test.tsx`: `render(<Decisiones/>)` directly (no router stub) — exactly one `<h1>Decisiones</h1>`; a ranked table and grand-totals card render when `loadSeedState()` has `verificado`+ orders. Run vitest, confirm failing (still `PlaceholderScreen`).
- [x] 3.2 RED (same file) — no-mutation-affordance case: rendered output contains no `<form>` element and no button wired to a store-mutating action. Confirm failing.
- [x] 3.3 RED (same file) — heading-uniqueness case: `getAllByRole('heading')` — only the single `<h1>` matches `/decisiones/i`; no subheading text contains "decisiones". Confirm failing.
- [x] 3.4 RED (same file) — empty-state case: seed state stubbed/filtered to only `creado` orders → single `<h1>` still renders, empty-state message shown, no ranking table/summary card rendered. Confirm failing.
- [x] 3.5 GREEN — rewrite `app/routes/decisiones.tsx` per design: `useState(() => buildProfitabilityRanking(loadSeedState()))`, direct render (no `<Form>`/loader/`useNavigate`), `<h1>Decisiones</h1>`, conditionally render `ProfitabilitySummary` + `ProfitabilityTable` when `view.count > 0` else empty-state message; keep existing `meta()`. Run vitest, confirm 3.1-3.4 passing.
- [x] 3.6 Verify `app/routes/__tests__/routes.test.tsx` still passes — the shared `{ path: '/decisiones', Component: Decisiones, heading: /decisiones/i }` entry still resolves to a single unambiguous heading match.
- [x] 3.7 Run the full `salesops-mvp` vitest suite (`pnpm --filter salesops-mvp test`) — confirm all green, including prior Task 2/4/5/6/7 regression suites (seed-store, tablero, operador-*, tasas, inventario).

## Verification

- [x] `pnpm --filter salesops-mvp typecheck` — confirm no type errors (new domain module, new components, zero `Order`/`SeedState`/`ExchangeRates` shape changes).
- [x] `pnpm --filter salesops-mvp test` — confirm full suite green (new tests + all prior task regressions).
