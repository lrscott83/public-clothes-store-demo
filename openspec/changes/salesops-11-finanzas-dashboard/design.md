# Design — Dashboard de Finanzas (`salesops-11-finanzas-dashboard`)

The `/finanzas` screen is rebuilt into a 3-layer financial control panel the SAME way `/decisiones` was: a thin direct-render container computes ONE typed view model from `loadSeedState()` via pure domain helpers, then hands numeric view models to leaf presentational components that reuse the existing generic chart primitives. It answers **"¿dónde está mi plata y hacia dónde se va?"** — it is a treasury/finance view, NOT a restatement of the operational `/decisiones` dashboard.

The governing constraint (USER-LOCKED): generic building blocks (chart primitives, `StatTile`, `InfoPopover`, pure time/ratio math) ARE shared; **domain/business calculations are NOT shared across dashboards.** `finanzas-dashboard.ts` is self-contained — it composes finance's OWN `buildFinanceSummary` and writes its OWN finance-angle helpers. It does **not** import `buildCurrencyMix`/`buildGestorRanking` or anything else from `decisiones-dashboard.ts`. There is zero directional coupling between the two dashboards.

## Quick path (decisions at a glance)

1. **Charts = the existing generic SVG primitives** (`StatTile`/`AreaTrend`/`BarChart`/`DonutChart`) — reused as-is, zero new deps, no new primitive.
2. **One orchestrator** `buildFinanceDashboard(state): FinanceDashboardView` in NEW `app/domain/finanzas-dashboard.ts`, composing `buildFinanceSummary` (unchanged) plus finance's OWN pure sub-helpers, each unit-tested. Numbers only — no formatting, no I/O.
3. **No cross-dashboard domain import.** finanzas computes its own FX exposure, its own gestor commission-cost/ROI, its own warehouse trapped-cash, its own cash-flow trend. Reused-but-refinanced data is recomputed from a genuinely financial angle by finance's own helpers.
4. **Generic infra is shared via NEUTRAL modules, never via the sibling dashboard.** Pure time/ratio math → NEW `app/domain/period-trend.ts`. The generic `InfoPopover` presentational primitive → relocated to `app/components/shared/info-popover.tsx`. `help-content` is domain CONTENT, not infra → finanzas gets its OWN `FINANZAS_HELP`.
5. **Formatting only at leaves.** USD → `formatMoney(v, { locale: 'en-US', currency: 'USD' })`. MN → plain `` `${v} MN` `` (never `formatMoney` — MN is not ISO). All MN metrics filter `qualifying()` + coalesce `?? 0`; every MN↔USD conversion uses the order's OWN frozen `exchangeRateSnapshot.usdToMn`, never live `state.exchangeRates`.

## Architecture: layering and boundaries

```
loadSeedState()  ──►  buildFinanceDashboard(state): FinanceDashboardView   (app/domain/*)
                          │  (pure, numeric, unit-tested — composes buildFinanceSummary + own helpers)
                          ▼
        finanzas.tsx  ──  useState(() => view)  — thin container, direct render
                          │  (picks empty-state vs 3 layers; no formatting logic)
                          ▼
   Section components (app/components/finanzas/*)  — format + compose charts + own help copy
                          │
                          ▼
   Generic primitives (app/components/charts/*, app/components/shared/*)  — no domain import
```

Rings, dependencies point inward only; **the finanzas ring never points sideways into the decisiones ring:**

| Ring | Knows about | Never imports |
|------|-------------|---------------|
| **Domain** (`app/domain/finanzas-dashboard.ts` + `finanzas.ts` + neutral `period-trend.ts`) | `SeedState`, `types.ts`, `buildFinanceSummary`, neutral period/trend math | React, formatting, `formatMoney`, DOM, **`decisiones-dashboard.ts` / any decisiones helper** |
| **Sections** (`app/components/finanzas/*`) | the finance view-model types, `formatMoney`, chart primitives, shared `InfoPopover`, `FINANZAS_HELP` | `SeedState`, `loadSeedState`, data derivation, **`components/decisiones/*`** |
| **Generic** (`app/components/charts/*`, `app/components/shared/*`) | plain numeric/label props | any `app/domain/*` type, `SeedState`, `formatMoney` |

## The 6 open decisions — RESOLVED

### Decision 1 — Shared-code location (RESOLVED: neutral modules, not sibling import)

Split "shared" into two categories and route each to a neutral home, so a second dashboard never reaches into the first dashboard's folders:

- **Generic time/ratio math** → extract to NEW neutral `app/domain/period-trend.ts`: the `Trend` / `KpiTrend` / `PeriodSplit` types and `splitByPeriod`, `buildKpiTrend`, `computeTrend`, `computeDelta`. These carry ZERO business meaning (pure window bucketing on `Order[]` + ratio math on numbers); the user explicitly named "period split" as the extraction candidate. `decisiones-dashboard.ts` is refactored to import from `period-trend.ts` **and re-export the same public symbols** (`splitByPeriod`, `PeriodSplit`, `Trend`, `KpiTrend`) so archived decisiones tests keep their import paths and stay green. `finanzas-dashboard.ts` imports the same neutral module. This is NOT cross-dashboard coupling — both dashboards depend on a neutral infra module, neither depends on the other.
- **Generic presentational primitive** `InfoPopover` (copy injected by caller, domain-agnostic — same category as `StatTile`/charts) → relocate to NEW neutral `app/components/shared/info-popover.tsx` (move the file + its test), update the two decisiones importers (`kpi-header.tsx`, `sales-trend-section.tsx`). finanzas imports from the shared path.
- **`help-content` is domain CONTENT, not infra** → NOT shared. finanzas gets its OWN `app/components/finanzas/help-content.ts` exporting `FINANZAS_HELP`.

Justification for the two extractions (per the "justify any extraction explicitly" rule): both are genuinely identical, domain-agnostic infrastructure with no financial or commercial meaning; duplicating them would be a real code smell, and routing them through neutral modules keeps the two dashboards fully decoupled. Everything with business meaning stays owned by each dashboard.

### Decision 2 — Cross-dashboard domain coupling (RESOLVED by USER-LOCK: none)

`finanzas-dashboard.ts` does **NOT** import `buildCurrencyMix`, `buildGestorRanking`, or any other business helper from `decisiones-dashboard.ts`. Every "reused-but-refinanced" datum is recomputed by finance's OWN helper from a genuinely financial angle:

| Datum | decisiones angle (do NOT import) | finanzas OWN helper (financial angle) |
|-------|----------------------------------|---------------------------------------|
| Currency/method mix | customer payment preference | `buildCurrencyExposure` — hard-currency (USD/ZELLE/EUR) vs local (MN) revenue share = FX/devaluation exposure |
| Gestor ranking | sales performance | `buildGestorCommissionCost` — commission COST, take-rate %, ROI, outstanding liability owed |
| Warehouse | sales volume by location | `buildWarehouseCashFlow` — uncollected cash trapped per warehouse (cobrado/pendiente) |
| Cash-flow trend | (sales trend, cantidad/valor) | `buildCashFlowTrend` — 20-day cobrado vs pendiente collections velocity |

The only domain code finanzas shares is neutral `period-trend.ts` infra and finance's OWN `buildFinanceSummary`. Small per-order math it needs (`orderCostUSD`, `orderCommissionUSD = commissionMN ÷ snapshot.usdToMn`) is written PRIVATELY inside `finanzas-dashboard.ts` — those private helpers are not exported by decisiones and are trivial finance-flavored MN↔USD math, so finance owns its own copy rather than reaching sideways.

### Decision 3 — Net-margin tile: windowed, value=USD / sublabel=% (RESOLVED)

Net margin is **windowed** (last 10 days vs prior 10), computed by finanzas' own `buildFinanceKpiHeader` (mirrors decisiones' `buildKpiHeader.margenUSD` math: `Σ over qualifying current-window orders of totalUSD − orderCostUSD − orderCommissionUSD`, each via the order's own snapshot). All-time totals are rejected for the KPI HEADER because every other tile carries a period trend arrow — an all-time figure has no comparable prior window and would break `StatTile`'s trend contract. The all-time/position view already lives in Layer 3 (gestor table, `StateBreakdownTable`).

Presentation: tile VALUE = net margin USD, `sublabel` = `` `${margenPercent.toFixed(1)}%` `` — identical shape to decisiones' Margen tile. The **gross→net wedge is expressed by the header itself**: tile 1 "Ingresos facturados" is the gross top line and tile 5 "Margen neto" is the bottom line, so the commission/cost drag is visible ACROSS the header without cramming a second sublabel into one tile (`StatTile` supports a single sublabel). The neto = facturado − costo − comisión formula is spelled out in the tile's `InfoPopover` help text.

### Decision 4 — Copy that avoids implying a real cash ledger (RESOLVED)

finanzas owns `FINANZAS_HELP` in `app/components/finanzas/help-content.ts` (same `HelpEntry` shape and warm Rioplatense voice as `DECISIONES_HELP` — this extends an existing Spanish dashboard). Caveat-critical label/help conventions (tasks/apply writes the exact strings; these are the non-negotiable framings):

- **Cobrado vs pendiente** — help MUST state it is a STATE proxy, not a cash register: "Aproximación por estado del pedido (entregado / comisión pagada = cobrado; verificado / transportando = pendiente). No es un registro de caja real." The tile/section wording uses "estimado/aprox." never "recibido".
- **Ingresos liquidados (MN)** — help frames it as revenue SETTLED in the local, devaluing currency = FX exposure, not cash-in-hand.
- **Comisión pagada** — help clarifies this is commission paid TO GESTORES (`commissionPaidAt`), a DIFFERENT event from client "cobrado" (order-state inferred). Never conflate the two.
- **Tendencia de cobros** — titled as an estimate ("Cobros estimados por estado"), help repeats the proxy caveat.
- No goal/target copy anywhere (locked); no Gross/Net/Fees/refunds vocabulary (single revenue per order).

### Decision 5 — CashFlowTrend rendering: ONE AreaTrend + cobrado↔pendiente toggle (RESOLVED)

`AreaTrend` is locked to a single polyline. Mirror `SalesTrendSection`'s proven pattern: a `CashFlowTrendSection` with a local `useState<'cobrado' | 'pendiente'>` toggle (two buttons) that re-projects the same `buildCashFlowTrend` output into `{ label, value }[]` for the selected series. Rejected: two side-by-side `AreaTrend`s (fights the single-polyline lock, halves chart width, doubles render-test surface). `buildCashFlowTrend` returns per-day `{ dayOffset, cobradoUSD, pendienteUSD }`; the section maps the chosen field. Render tests assert one `<svg>`/`<polyline>` and toggling switches the series (mirrors `sales-trend-section.test.tsx`).

### Decision 6 — StateBreakdownTable: keep as-is (RESOLVED)

Keep `app/components/finanzas/state-breakdown-table.tsx` literally unchanged and demote it to the Layer-3 drill-down. It is already tested and correct; its heading "Flujo por estado" already avoids the word "finanzas" (routes-test contract) and its commission column already renders plain MN with a `—` for `creado`. Restyling to the new card chrome would churn a passing component + render test for pure cosmetics with zero functional gain. The proposal explicitly demotes it "not rewritten." Consumed unchanged.

## Domain layer: the view model

### Orchestrator

```ts
// app/domain/finanzas-dashboard.ts
export function buildFinanceDashboard(state: SeedState): FinanceDashboardView
```

`hasData` is `false` only when every order is `creado` (or the seed is empty) — the container renders the empty-state instead of the layers (mirrors decisiones).

```ts
export interface FinanceDashboardView {
  hasData: boolean;
  kpis: FinanceKpiHeaderView;              // Layer 1
  cashFlowTrend: CashFlowTrendView;        // Layer 2a
  commissionLiability: CommissionLiabilityView; // Layer 2b (from buildFinanceSummary.kpis)
  revenueByState: RevenueByStateView;      // Layer 2c (from buildFinanceSummary.rows)
  currencyExposure: CurrencyExposureView;  // Layer 2d
  gestorCommission: GestorCommissionCostView; // Layer 3a
  warehouseCashFlow: WarehouseCashFlowView;   // Layer 3b
  stateBreakdown: FinanceStateRow[];       // Layer 3c — buildFinanceSummary.rows, unchanged
}
```

### Sub-helpers (each pure, each unit-tested; all in `finanzas-dashboard.ts`)

| Helper | Signature | Produces | Derivation rule |
|--------|-----------|----------|-----------------|
| `buildFinanceKpiHeader` | `(state) => FinanceKpiHeaderView` | 5 windowed KPI tiles | Uses neutral `splitByPeriod`. Tiles: `ingresosFacturadosUSD` (Σ `totalUSD` qualifying), `ingresosLiquidadosMN` (Σ `totalMN ?? 0` qualifying), `cobradoUSD`+`pendienteUSD` (state proxy), `comisionPendienteMN` (unpaid verificado/transportando/entregado), `margenNetoUSD`+`margenPercent` (Σ `totalUSD − cost − commissionUSD`, current window). Each numeric field is a `KpiTrend` (current/prior/delta/trend); `prior === 0` → `delta: null`. |
| `buildCashFlowTrend` | `(state) => CashFlowTrendView` | 20-day series | Bucket qualifying orders by `createdAt` day-offset 0..19 from `state.generatedAt`; per day `cobradoUSD` (Σ `totalUSD` where state ∈ COBRADO_STATES) + `pendienteUSD` (Σ where state ∈ PENDIENTE_STATES). Missing days = 0. Ordered oldest→newest. Mirrors `buildSalesTrend`. |
| `buildCurrencyExposure` | `(state) => CurrencyExposureView` | slices per payment method + hard/local flag | Group qualifying orders by `payment.method` (USD/MN/ZELLE/EUR/otros). Each slice: `revenueUSD` (Σ `totalUSD`), `percent` (share of total revenueUSD), `isHardCurrency` (USD/ZELLE/EUR true, MN/otros false). Financial angle: hard vs local exposure. |
| `buildGestorCommissionCost` | `(state) => GestorCommissionCostView` | per-gestor cost/ROI/liability | One row per `state.gestores`; `revenueUSD`, `commissionEarnedMN` (Σ all qualifying), `commissionPendingMN` (unpaid pending states), **derived** `commissionPaidMN = earned − pending`, **derived** `takeRatePercent` (commissionEarnedUSD ÷ revenueUSD × 100), **derived** `roi` (revenueUSD ÷ commissionEarnedUSD). Zero-order gestor → all 0, guards ÷0. Sorted desc by `revenueUSD`. |
| `buildWarehouseCashFlow` | `(state) => WarehouseCashFlowView` | per-warehouse cobrado/pendiente | One row per `state.warehouses` (qualifying orders); `cobradoUSD` / `pendienteUSD` by state proxy. Zero-order warehouse still appears at 0. Sorted desc by (cobrado+pendiente). Mirrors `buildWarehouseSales` shape. |
| _(compose)_ `buildFinanceSummary` | `(state) => FinanceView` | commission KPIs + per-state rows | UNCHANGED. Orchestrator maps `.kpis` → `commissionLiability` (donut: paid vs pending) and `.rows` → `revenueByState` (bars: revenueUSD per state) and `stateBreakdown` (Layer-3 table, verbatim). |

Private to `finanzas-dashboard.ts` (finance owns, not imported from decisiones): `qualifying`, `sumUSD`, `sumCommissionMN`, `orderCostUSD`, `orderCommissionUSD` (= `commissionMN ?? 0` ÷ `snapshot.usdToMn`, guard `usdToMn > 0`), `orderMarginUSD`, and the `COBRADO_STATES` / `PENDIENTE_STATES` / `PENDING_COMMISSION_STATES` groupings.

## Component layer

New under `app/components/finanzas/` (each with a render test, each with an `InfoPopover` from `FINANZAS_HELP`):

| Component | Primitive used | Renders |
|-----------|----------------|---------|
| `finance-kpi-header.tsx` | 5× `StatTile` | Ingresos facturados / Ingresos liquidados (MN) / Cobrado vs pendiente / Comisión pendiente (MN) / Margen neto (% sublabel). `comisionPendienteMN` and `pendiente` use `positiveIsGood={false}`. |
| `cash-flow-trend-section.tsx` | `AreaTrend` | 20-day trend + local cobrado↔pendiente toggle (Decision 5). |
| `commission-liability-donut.tsx` | `DonutChart` | 2 slices: comisión pagada vs pendiente (MN). |
| `revenue-by-state-bars.tsx` | `BarChart` | revenueUSD per OrderState (working capital locked). |
| `currency-exposure-donut.tsx` | `DonutChart` | revenue share per method; hard vs local (FX exposure). |
| `gestor-commission-table.tsx` | table | ingreso, comisión devengada, pagada, pendiente, take-rate %, ROI. |
| `warehouse-cash-flow.tsx` | `BarChart` or table | cobrado/pendiente per warehouse. |
| `state-breakdown-table.tsx` | — | REUSED UNCHANGED (Decision 6). |
| `help-content.ts` | — | `FINANZAS_HELP` dict (Decision 4). |

Relocation: `app/components/decisiones/info-popover.tsx` (+ test) → `app/components/shared/info-popover.tsx`; update decisiones + finanzas importers (Decision 1).

Superseded/removed: `app/components/finanzas/commission-summary.tsx` (+ its test) is replaced by `finance-kpi-header` + `commission-liability-donut`; the rewritten container no longer references it. Recommend deleting both to avoid dead code (its data is fully covered elsewhere).

## Container rewrite

`app/routes/finanzas.tsx` becomes a 3-layer direct-render container mirroring `decisiones.tsx`: `useState(() => buildFinanceDashboard(loadSeedState()))`, no RR7 `<Form>`/action/loader/`useNavigate` (preserves the jsdom+undici `AbortSignal` sidestep). Keep the exact `<h1>Finanzas</h1>` + `<p>Comisiones y flujo de caja</p>` subtitle pattern (routes-test heading contract). Empty-state when `!hasData`. **Every section heading avoids the word "finanzas"** (routes.test.tsx asserts exactly one `/finanzas/i` heading = the h1).

## Test strategy note (for tasks phase — Strict TDD active)

- **Domain unit tests** `app/domain/__tests__/finanzas-dashboard.test.ts` (RED→GREEN per helper): windowing + `qualifying` filter + `totalMN ?? 0` NaN guard + per-order snapshot conversion + `prior === 0 → delta null` (KPI header); 20-bucket zero-fill + `diff < 0` skip + cobrado/pendiente split (cash-flow trend); method grouping + `otros` bucket + hard/local + percent (currency exposure); earned/paid/pending + take-rate + ROI + ÷0 guards + zero-order gestor (gestor cost); per-warehouse cobrado/pendiente + zero warehouse (warehouse cash flow); `hasData` false when all `creado` + composition (orchestrator).
- **`period-trend.test.ts`**: relocate/retain `splitByPeriod` coverage; the extraction must keep the decisiones domain + component suites green (re-export preserves API — run them as a regression gate).
- **Component render tests** per new finanzas component, mirroring the decisiones component tests (assert SVG nodes / rows / toggle behavior / MN-as-plain-text / USD-via-formatMoney).
- **Route rewrite** `app/routes/__tests__/finanzas.test.tsx`: **near-total rewrite required.** The current suite asserts `queryAllByRole('button')` has length 0 (line 44) — this INVERTS because the dashboard now has toggle + `InfoPopover` "?" buttons. New assertions: single `<h1>Finanzas</h1>`, KPI header + each layer section present, no `<form>`, no "marcar comisión pagada" copy, empty-state path. Preserve the routes.test.tsx single-`/finanzas/i`-heading contract.

## Residual risks for tasks/apply

1. **InfoPopover relocation touches in-flight decisiones files.** `info-popover.tsx`/`help-content.ts` + the modified decisiones components are currently UNCOMMITTED on this branch. The relocation must be atomic and the FULL decisiones test suite re-run; watch for rebase friction if the decisiones info-popover work lands separately.
2. **`period-trend.ts` extraction refactors archived `decisiones-dashboard.ts`.** Re-export keeps the public API stable, but the decisiones domain + component tests are the regression gate — they MUST stay green.
3. **finanzas.test.tsx "no button" assertion inverts.** If not rewritten, CI goes red — this is a required rewrite, not optional.
4. **`commission-summary` removal drops a passing test.** Ensure the container no longer imports it and the routes heading contract is intact before deleting.
5. **Windowed net margin can be misread as all-time P&L.** Copy must say "últimos 10 días"; help text carries the neto formula.
6. **"Cobrado" proxy discipline.** Reviewer must confirm no label/help implies a literal cash ledger (caveats #2/#5); "estimado/aprox." wording is mandatory.
7. **MN NaN trap.** Any new MN metric that forgets `qualifying()` + `?? 0` silently yields NaN — covered by explicit unit tests above.

## Next step

Run `sdd-tasks` (after the spec is ready) to slice this file-by-file plan into ordered RED→GREEN work units.
