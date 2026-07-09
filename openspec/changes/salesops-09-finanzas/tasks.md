# Tasks: Pantalla 7 — Finanzas (salesops-09-finanzas, Task 9)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300-370 (1 domain helper + test, 2 presentational components + tests, 1 container rewrite + test) |
| 400-line budget risk | Medium (design's own estimate is ~170 impl / ~370 with tests, in line with prior single-screen budget) |
| Chained PRs recommended | No |
| Suggested split | Single PR, `size:exception` if diff lands 370-400+ |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Domain builder `buildFinanceSummary` (Phase 1) | No UI; safe to land first, zero schema changes |
| 2 | `CommissionSummary` + `StateBreakdownTable` (Phase 2) | Depends on Unit 1's types only |
| 3 | `finanzas.tsx` container rewrite + regression (Phase 3) | Depends on Units 1-2 |

All units land in one PR (`size:exception` if diff approaches/exceeds 400 lines) — split shown only for internal sequencing.

Test runner: `npm test` (`vitest run`), run from `templates/apps/salesops-mvp`. Every implementation
item below is RED (write failing test, run suite, confirm fail) → GREEN (minimal implement) →
confirm pass, mirroring `openspec/changes/archive/2026-07-09-salesops-08-decisiones/tasks.md`.

## Phase 1: Domain builder — `app/domain/finanzas.ts`

- [x] 1.1 RED — create `app/domain/__tests__/finanzas.test.ts`: paid/pending/total split case — one `comision_pagada` order with `commissionMN:3000`, one `verificado` order with `commissionMN:1000`, one `entregado` order with `commissionMN:2000` → `commissionPaidMN:3000`, `commissionPendingMN:3000`, `commissionTotalMN:6000`. Run `npm test` (from `templates/apps/salesops-mvp`), confirm failing (module missing).
- [x] 1.2 RED (same file) — `pendingPaymentCount` case: same fixture → `pendingPaymentCount:2` (verificado + entregado only; excludes creado and comision_pagada). Confirm failing.
- [x] 1.3 RED (same file) — `creado` no-NaN case: a `creado` order with no frozen `commissionMN` → contributes `0` to `commissionPaidMN`, `commissionPendingMN`, `commissionTotalMN`, and is not counted in `pendingPaymentCount`. Confirm failing.
- [x] 1.4 RED (same file) — paidAt equivalence case: an order with `state:'comision_pagada'` and a separate order with only `commissionPaidAt` set (any state) both count toward `commissionPaidMN`, not `commissionPendingMN`. Confirm failing.
- [x] 1.5 RED (same file) — per-state aggregation case: two `entregado` orders with `totalUSD` `100`/`150` and `commissionMN` `10`/`20` → the `entregado` row has `count:2`, `revenueUSD:250`, `commissionMN:30`. Confirm failing.
- [x] 1.6 RED (same file) — `creado` row case: a `creado` order with `totalUSD:80` and no frozen `commissionMN` → the `creado` row's `revenueUSD` includes `80` and `commissionMN` is `0` (never `NaN`/`undefined`). Confirm failing.
- [x] 1.7 RED (same file) — fixed row order + zero-count states case: `SeedState.orders` contains orders only in `creado` and `entregado` → `rows` has exactly 5 entries, `rows.map(r => r.state)` deep-equals `['creado','verificado','transportando','entregado','comision_pagada']`, and the `verificado`/`transportando`/`comision_pagada` rows each show `count:0`. Confirm failing.
- [x] 1.8 RED (same file) — all-empty case: `state.orders = []` → `rows` has 5 entries all `{count:0, revenueUSD:0, commissionMN:0}`, and every KPI (`commissionPaidMN`, `commissionPendingMN`, `commissionTotalMN`, `pendingPaymentCount`) is `0` (no throw). Confirm failing.
- [x] 1.9 GREEN — implement `app/domain/finanzas.ts` per design: export `FinanceKpis`, `FinanceStateRow`, `FinanceView`, `buildFinanceSummary(state: SeedState): FinanceView`. Exhaustive `Record<OrderState, string>` `STATE_LABELS` + fixed `COLUMN_ORDER` (`creado→verificado→transportando→entregado→comision_pagada`), `isPaid(o) = o.state==='comision_pagada' || o.commissionPaidAt != null`, `isPending(o) = !isPaid(o) && o.state ∈ {verificado,transportando,entregado}`, `commOf(o) = o.commissionMN ?? 0`, rows built by filtering `orders` per `COLUMN_ORDER` state (not vice-versa) so all 5 rows are always present. No MN→USD conversion anywhere. Run `npm test`, confirm 1.1-1.8 passing.

## Phase 2: Presentational components

- [x] 2.1 RED — create `app/components/finanzas/__tests__/commission-summary.test.tsx`: render `<CommissionSummary kpis={...}/>` — labels present ("Resumen de comisiones" heading does NOT contain "finanzas"); each of `commissionPaidMN`/`commissionPendingMN`/`commissionTotalMN` renders as plain `{value} MN` text; `pendingPaymentCount` renders as a plain number. Run `npm test`, confirm failing (module missing).
- [x] 2.2 RED (same file) — no-formatMoney-on-MN case: assert none of the rendered MN figures match the `formatMoney` USD pattern `^\$[\d,]+\.\d{2}$` (no `$` prefix anywhere in the KPI block). Confirm failing.
- [x] 2.3 GREEN — create `app/components/finanzas/commission-summary.tsx`: `CommissionSummaryProps { kpis: FinanceKpis }`, `<h2>Resumen de comisiones</h2>`, `dl` with Comisión pagada/pendiente/total as plain `{value} MN` text (no `formatMoney` import) + "Pendientes de pago" = `kpis.pendingPaymentCount`. Run `npm test`, confirm 2.1-2.2 passing.
- [x] 2.4 RED — create `app/components/finanzas/__tests__/state-breakdown-table.test.tsx`: render `<StateBreakdownTable rows={[...5 rows...]}/>` — exactly 5 rows rendered in order; each row's revenue cell matches `^\$[\d,]+\.\d{2}$`; heading ("Flujo por estado") does NOT contain "finanzas". Confirm failing (module missing).
- [x] 2.5 RED (same file) — commission cell case: a non-`creado` row's commission cell renders plain `{value} MN` text (not `$`-prefixed); the `creado` row's commission cell renders "—" instead of `0 MN` or a `$`-formatted value. Confirm failing.
- [x] 2.6 RED (same file) — zero-count row case: a row with `count:0` still renders (`Pedidos` cell shows `0`, revenue cell still matches the `formatMoney` regex for `$0.00`) without throwing. Confirm failing.
- [x] 2.7 GREEN — create `app/components/finanzas/state-breakdown-table.tsx`: `StateBreakdownTableProps { rows: FinanceStateRow[] }`, `<h2>Flujo por estado</h2>`, table columns Estado (`row.label`) | Pedidos (`count`) | Ingresos (`formatMoney(revenueUSD, MONEY)`) | Comisión (`{commissionMN} MN`, or `—` when `row.state === 'creado'`). Run `npm test`, confirm 2.4-2.6 passing.

## Phase 3: Container wiring + regression

- [x] 3.1 RED — create `app/routes/__tests__/finanzas.test.tsx`: `render(<Finanzas/>)` directly (no router stub, `beforeEach(localStorage.clear)`) — exactly one `<h1>Finanzas</h1>`; both `CommissionSummary` ("Resumen de comisiones") and `StateBreakdownTable` ("Flujo por estado") blocks render. Run `npm test`, confirm failing (still `PlaceholderScreen`).
- [x] 3.2 RED (same file) — heading-uniqueness case: `getAllByRole('heading')` — only the single `<h1>` matches `/finanzas/i`; neither subheading text contains the substring "finanzas"; the "Comisiones y flujo de caja" descriptor is present as a `<p>`, not a heading (`queryByRole('heading', {name:/comisiones y flujo de caja/i})` is null). Confirm failing.
- [x] 3.3 RED (same file) — no-mutation-affordance case: rendered output contains no `<form>` element and `queryAllByRole('button')` has length 0; no "marcar comisión pagada" text is present. Confirm failing.
- [x] 3.4 RED (same file) — empty-state case: `localStorage` cleared with a stubbed empty `SeedState.orders` (or `resetDemo`-equivalent producing zero orders) → the single `<h1>` still renders, all four KPI values render as `0`, and the breakdown table still shows all 5 states each with `count:0`. Confirm failing.
- [x] 3.5 GREEN — rewrite `app/routes/finanzas.tsx` per design: `useState(() => buildFinanceSummary(loadSeedState()))`, direct render (no `<Form>`/loader/`useNavigate`), `<h1 className="text-2xl font-bold text-text">Finanzas</h1>` + `<p className="mt-1 text-sm text-text-muted">Comisiones y flujo de caja</p>` subtitle, `<CommissionSummary kpis={view.kpis}/>` + `<StateBreakdownTable rows={view.rows}/>` (both always render — rows are never empty, 5 fixed rows). Keep existing `meta()` title "Finanzas — Sales Ops Cockpit". Run `npm test`, confirm 3.1-3.4 passing.
- [x] 3.6 Verify `app/routes/__tests__/routes.test.tsx` still passes — the shared `{ path: '/finanzas', Component: Finanzas, heading: /finanzas/i }` entry still resolves to a single unambiguous heading match.
- [x] 3.7 Run the full `salesops-mvp` vitest suite (`npm test`, from `templates/apps/salesops-mvp`) — confirm all green, including prior Task 2/4/5/6/7/8 regression suites (seed-store, tablero, operador-*, tasas, inventario, decisiones).

## Verification

- [x] `npm run typecheck` (from `templates/apps/salesops-mvp`) — confirm no type errors (new domain module, new components, zero `Order`/`SeedState`/`OrderState` shape changes).
- [x] `npm test` (from `templates/apps/salesops-mvp`) — confirm full suite green (new tests + all prior task regressions).
