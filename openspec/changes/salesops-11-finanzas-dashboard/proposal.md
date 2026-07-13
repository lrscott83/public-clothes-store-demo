# Proposal — Dashboard de Finanzas (`salesops-11-finanzas-dashboard`)

Replace the tabular, read-only `/finanzas` screen (today a 4-KPI commission card + a 5-row state table) with a 3-layer financial control panel that answers one question the owner cannot answer today: **"¿dónde está mi plata y hacia dónde se va?"** — where is my money and where is it going. The screen becomes a treasury/finance view (revenue & FX exposure, cash collection, commission as a real cost/liability, net bottom line), NOT a restatement of the operational/commercial `/decisiones` dashboard. It is fed 100% by data the seed already produces.

## Intent

- **Problem:** `/finanzas` currently shows four commission KPIs (paid/pending/total MN + pending count) and one table of revenue-by-state. It never surfaces the business's actual money position: how much income is trapped in local currency (MN) versus hard currency, how much cash is uncollected, what commissions really cost as a share of revenue, and — critically — the **net** bottom line after paying gestores. The owner sees commission plumbing but not the P&L.
- **Why now:** The direct precedent (`salesops-10-decisiones-dashboard`) is built, archived, and proven: 4 domain-agnostic SVG chart primitives (`StatTile`/`AreaTrend`/`BarChart`/`DonutChart`), the `InfoPopover` help pattern, the period-trend helpers, and two directly reusable finance aggregations (`buildCurrencyMix`, `buildGestorRanking`) already exist. The enabling data (`totalMN`, `commissionMN`, `commissionPaidAt`, `payment.method`, `exchangeRateSnapshot`) is committed. Everything needed to build the finance view exists — only the finance framing and two small aggregations are missing.
- **Success looks like:** A single `/finanzas` screen where the owner reads, top to bottom: 5 finance KPI tiles with 10-day-vs-prior-10 trend, 3-4 visuals (cash-collection trend, commission liability split, revenue locked per pipeline stage, currency/settlement mix), and 3 actionable blocks (commission cost & ROI per gestor, pending cash per warehouse, revenue-by-state detail). Every number traces to a real seed field with no invention. Pure domain helpers carry unit tests; presentational components carry render tests. The direct-render container pattern is preserved.

## Scope

### In scope

- **Layer 1 — KPI header (5 finance tiles)** with period comparison (last 10 days vs prior 10) via reused `splitByPeriod`/`buildKpiTrend`:
  - Ingresos facturados (USD) — Σ `totalUSD`, qualifying orders (`state !== 'creado'`) — top line.
  - **Ingresos liquidados (MN)** — Σ `totalMN`, qualifying only — FX/settlement exposure. **First time `totalMN` is surfaced anywhere in the app.**
  - Cobrado vs pendiente (USD) — `COBRADO_STATES` vs `PENDIENTE_STATES` proxy — headline cash position.
  - Comisión pendiente (MN), sublabel devengada/pagada — the real liability owed to gestores, from `buildFinanceSummary` KPIs.
  - **Margen neto (USD) + %** — `totalUSD − costo − comisión` (from `buildProfitabilityRanking` / `buildKpiHeader.margenUSD`) — the true bottom line after commission cost.
- **Layer 2 — 3-4 visuals ("la foto"):**
  - Tendencia de cobros (20 días, área, toggle **cobrado ↔ pendiente**) — collections velocity, when cash lands.
  - Comisión: pagada vs pendiente (dona, 2 slices) — commission liability composition.
  - Ingresos por estado (barras, ponderado por USD) — working-capital / revenue value locked per pipeline stage.
  - Mix por moneda / método de pago (dona, revenue-weighted) — hard-currency vs local-currency income share = devaluation exposure.
- **Layer 3 — 3 actionable blocks:**
  - Comisión y ROI por gestor (tabla: ingreso generado, comisión devengada, pagada [derived], pendiente, take-rate %) — commission **cost** and return per gestor.
  - Cobros pendientes por almacén (barras o tabla) — pending cash trapped per warehouse.
  - Flujo por estado (tabla detalle) — the existing `StateBreakdownTable`, demoted from "the whole screen" to Layer-3 drill-down.
- New pure domain builder `buildFinanceDashboard` in a new `app/domain/finanzas-dashboard.ts`, **composing** `buildFinanceSummary` unchanged (mirrors how decisiones composed `buildProfitabilityRanking`), plus 2 new pure helpers (`buildCashFlowTrend`, `buildWarehouseCashFlow`) and a finance-flavored KPI-header helper — each with unit tests.
- New presentational components under `app/components/finanzas/`, each with render tests and an `InfoPopover` help affordance.
- Rework of `app/routes/finanzas.tsx` into a 3-layer direct-render container mirroring `routes/decisiones.tsx`.

### Out of scope

- **Meta / objetivo financiero** — no revenue/cash target, no vs-goal gauge or semáforo. The seed has no goal field (same locked decision as decisiones).
- **Modelo Gross/Net/Fees/descuentos/reembolsos/impuestos** — the seed has no adjustments layer; only one `totalUSD`/`totalMN` per order. Square's full Sales Summary model is NOT replicable and will not be faked.
- **Real cash ledger** — there is no `paymentReceivedAt` event; "cobrado" is a STATE proxy, never a literal received-cash timestamp.
- Any change to `buildFinanceSummary`, `buildProfitabilityRanking`, or the chart primitives' shapes — this change **consumes** them.
- Any new data model, seed change, or persisted field beyond what `SeedState` already exposes.
- Mutation affordances — the screen stays read-only (no `<Form>`, action, loader, or `useNavigate`; preserves the jsdom+undici `AbortSignal` sidestep).

## The 3-layer dashboard — every visual mapped to its seed field & financial rationale

### Layer 1 — KPI header (5 tiles, period trend)

| KPI | Exact seed field(s) | Financial rationale |
|-----|---------------------|---------------------|
| Ingresos facturados (USD) | Σ `Order.totalUSD`, qualifying (`state !== 'creado'`) | Top-line revenue billed. |
| Ingresos liquidados (MN) | Σ `Order.totalMN` (present verificado+), qualifying | Income settled in the **local, devaluing** currency = FX exposure. NEW surfacing. |
| Cobrado vs pendiente (USD) | Σ `totalUSD` split by `COBRADO_STATES` (entregado, comision_pagada) vs `PENDIENTE_STATES` (verificado, transportando) | Cash position: how much is in-hand vs trapped in open orders (state proxy). |
| Comisión pendiente (MN) | `buildFinanceSummary` → `commissionPendingMN` (sublabel `commissionPaidMN`/`commissionTotalMN`) | Real liability owed to gestores — cash the business still has to pay out. |
| Margen neto (USD) + % | `totalUSD − costo(items·costUSD) − comisiónUSD(commissionMN ÷ exchangeRateSnapshot.usdToMn)` via `buildKpiHeader.margenUSD` / `buildProfitabilityRanking` | The bottom line **after** commission cost — the owner's true take, never shown today. |

### Layer 2 — visuals ("la foto")

| Visual | Primitive | Exact seed field(s) | Financial rationale |
|--------|-----------|---------------------|---------------------|
| Tendencia de cobros (20d, toggle cobrado↔pendiente) | `AreaTrend` | `totalUSD` day-bucketed by `createdAt`, split by `COBRADO_STATES`/`PENDIENTE_STATES` — NEW `buildCashFlowTrend` | Collections velocity — when money actually lands vs sits pending. |
| Comisión pagada vs pendiente (dona) | `DonutChart` | `commissionPaidMN` / `commissionPendingMN` from `buildFinanceSummary` | How much of accrued commission is still an open liability. |
| Ingresos por estado (barras) | `BarChart` | `FinanceStateRow.revenueUSD` per `OrderState` (from `buildFinanceSummary`) | Working capital: **revenue value** locked at each pipeline stage (weighted by $, not order count). |
| Mix por moneda / método de pago (dona) | `DonutChart` | `buildCurrencyMix` → `revenueUSD`+`percent` per `payment.method` (USD/MN/ZELLE/EUR/otros) | Hard-currency (USD/ZELLE/EUR) vs local (MN) income share = devaluation/settlement risk. |

### Layer 3 — actionable blocks

| Block | Exact seed field(s) | Financial rationale |
|-------|---------------------|---------------------|
| Comisión y ROI por gestor (tabla) | `buildGestorRanking` → `revenueUSD`, `commissionEarnedMN`, `commissionPendingMN`; **derived** pagada = earned − pending; **derived** take-rate = commission ÷ revenue | Commission as a **cost center**: what each gestor costs, ROI (revenue ÷ commission), and outstanding liability owed. |
| Cobros pendientes por almacén (barras/tabla) | `totalUSD` grouped by `warehouseId` into cobrado/pendiente — NEW `buildWarehouseCashFlow` | Where uncollected cash is physically trapped. |
| Flujo por estado (tabla detalle) | existing `StateBreakdownTable` (count, `revenueUSD`, `commissionMN` per state) | Drill-down: revenue aging across the pipeline (DSO-style proxy). |

## Reused-but-refinanced — same datum, genuinely different financial angle

This dashboard deliberately reuses data `/decisiones` also shows, but only where the **financial framing is materially different**. No section is copied verbatim.

| Datum | `/decisiones` angle (commercial/operational) | `/finanzas` angle (financial) |
|-------|----------------------------------------------|-------------------------------|
| Payment/currency mix (`buildCurrencyMix`) | Customer payment preference / commercial mix | Hard-currency vs local-currency income share = FX & devaluation exposure |
| Gestor ranking (`buildGestorRanking`) | Sales performance — who sells the most | Commission **cost** & ROI per gestor + outstanding commission liability |
| Warehouse | Sales volume by location (operations) | Uncollected cash trapped per warehouse (`buildWarehouseCashFlow`) |
| Margin | What is profitable to sell (buying decisions) | Net bottom line after commission; gross-vs-net wedge = commission drag |
| Cobrado vs pendiente | One secondary KPI tile among five | Headline cash position + drives the whole cash-collection trend visual |
| Pipeline by state | Stage **count** distribution — where orders are stuck (operational) | Revenue **value** locked per stage — working capital & aging (financial) |

## Honest-data caveats (non-negotiable, inherited from salesops-10 discipline)

1. **100% real:** revenue USD/MN, commission accrued/paid/pending, payment-method mix, per-state revenue, per-gestor commission, per-warehouse split — all directly summable from existing fields, zero fabrication.
2. **"Cobrado vs pendiente" is a STATE proxy, not a cash ledger** — no `paymentReceivedAt` field exists. Copy must label it as an approximation (entregado/comision_pagada = cobrado; verificado/transportando = pendiente).
3. **No goal/target data** — no gauge or vs-meta semáforo anywhere (same locked decision as decisiones).
4. **No Gross/Net/Fees/discounts/refunds** — only a single revenue figure per order; no adjustments layer to replicate Square's model.
5. **Commission "pagada" (to the gestor) ≠ "cobrado" (from the client)** — two different real-world events. Only `commissionPaidAt` is modeled explicitly; "cobrado" is inferred from order state. Copy must never conflate them.
6. **`totalMN` is undefined on `creado` orders** — every MN-denominated metric MUST reuse the existing `qualifying()` (`state !== 'creado'`) filter and coalesce `?? 0`, or it silently produces NaN. Same rule for `commissionMN` and `exchangeRateSnapshot`.

## Approach

Mirror the proven decisiones architecture 1:1: a thin direct-render route container computes its view model once from `loadSeedState()` via pure domain helpers, then hands typed view models to leaf presentational components.

| Decision | Rationale |
|----------|-----------|
| New `buildFinanceDashboard` in `domain/finanzas-dashboard.ts` composing `buildFinanceSummary` unchanged | The ONLY approach consistent with how decisiones was built (it never mutated `buildProfitabilityRanking`). Keeps the already-locked `FinanceView` shape and its tests stable; new dashboard tests stay isolated. |
| Reuse `buildCurrencyMix` + `buildGestorRanking` from `decisiones-dashboard.ts` | Both already emit exactly the finance shapes needed (revenue+percent per method; per-gestor earned/pending commission). Forking would duplicate logic with no benefit. |
| 2 new pure helpers only: `buildCashFlowTrend` (20-day cobrado/pendiente day-buckets, mirrors `buildSalesTrend`) + `buildWarehouseCashFlow` (per-warehouse cobrado/pendiente USD, mirrors `buildWarehouseSales`) | Minimal net-new domain surface; each mirrors an existing, tested shape. |
| Reuse all 4 chart primitives + `InfoPopover`/help-content pattern unchanged | Every finance visual fits the primitives' generic `{label,value}` / `{current,prior,delta,trend}` shapes. No new chart primitive, no chart library. |
| Keep `StateBreakdownTable` as the Layer-3 detail table | Already tested and correct; demoted, not rewritten. |
| Keep the direct-render container (local `useState`, no RR7 Form/loader/`useNavigate`) | Preserves the jsdom+undici `AbortSignal` sidestep; screen is read-only. |
| Formatting/locale only at leaf render | Domain helpers stay pure and numeric (MN must go through `formatMoney` at the leaf — the old screen rendered MN as plain text, which this change fixes). |

## Open decisions to resolve in spec / design (do NOT decide here)

1. **Shared-code location:** promote `splitByPeriod`/`buildKpiTrend`/`computeTrend`/`computeDelta` to a shared `domain/period-trend.ts`, and `InfoPopover`+help pattern to `components/shared/` — OR import directly from `decisiones-dashboard.ts`/`components/decisiones/`? (Second dashboard now needs them; direct import couples the two dashboards' domain layers.)
2. **Cross-dashboard domain dependency:** is importing `buildCurrencyMix`/`buildGestorRanking` from `decisiones-dashboard.ts` into `finanzas-dashboard.ts` acceptable coupling, or should shared aggregations move to a neutral module? (Design phase.)
3. **Net-margin tile source:** windowed net margin from `buildKpiHeader.margenUSD` (momentum-consistent with the other tiles) vs all-time totals from `buildProfitabilityRanking` (position-oriented, what finance owners usually want) — and whether to show the gross→net commission-wedge as a sublabel.
4. **Exact copy** for "Cobrado", "Comisión pagada", and "Ingresos liquidados (MN)" so no label implies a cash-ledger precision the seed lacks (caveats #2/#5).
5. **CashFlowTrend rendering:** cobrado/pendiente as a toggle (mirrors `SalesTrendSection`'s cantidad/valor toggle) vs two side-by-side `AreaTrend`s — `AreaTrend` is locked to a single polyline. (Design phase.)
6. **StateBreakdownTable chrome:** keep literally as-is in Layer 3, or restyle to match the new card/section chrome used by `components/decisiones/*`.

## Constraints to honor

- 100% real seeded data; no new data model beyond existing `SeedState`.
- Strict TDD is active: pure domain helpers with unit tests + presentational components with render tests.
- Preserve the direct-render container pattern (no `<Form>`, loader, action, or `useNavigate`).
- All MN metrics filter `qualifying()` and coalesce `?? 0`; all MN↔USD math uses the order's own frozen `exchangeRateSnapshot.usdToMn`, never live `state.exchangeRates`.
- Do not reopen locked decisions (no target, no Gross/Net/Fees, cobrado is a state proxy).

## Next step

Run `sdd-spec` and `sdd-design` (they can proceed in parallel). `sdd-design` owns the shared-code location, cross-dashboard coupling, and CashFlowTrend rendering decisions flagged above.
