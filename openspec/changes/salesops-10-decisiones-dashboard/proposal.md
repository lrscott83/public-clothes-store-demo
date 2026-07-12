# Proposal — Dashboard de Decisiones (`salesops-10-decisiones-dashboard`)

Replace the minimal `/decisiones` screen (today a lone profitability ranking table + totals card) with a 3-layer visual decision dashboard: a KPI header that reads in 5 seconds, four business visuals, and three actionable decision blocks. The screen becomes both a commercial hook and a daily operating tool, fed 100% by data the seed already produces.

## Intent

- **Problem:** `/decisiones` currently renders only `buildProfitabilityRanking` (one table + one summary card). The original plan promised six visuals; the owner has no fast read on sales, margin, cash health, or where orders are stuck. The screen under-sells the product and under-serves the operator.
- **Why now:** The approved design (`docs/plans/dashboard-decisiones-design.md`) is locked, the honest data caveats are resolved, and the enabling seed diversity (ZELLE/EUR payment methods, `VERSION` 4) is already committed. Everything needed to build is in place — only the dashboard itself is missing.
- **Success looks like:** A single `/decisiones` screen where the owner sees, top to bottom: 5 KPI tiles with 10-day-vs-prior-10-day trend, 4 visuals (sales trend, orders-by-stage distribution, sales-by-warehouse, currency/payment mix), and 3 decision blocks (gestor ranking, top products by margin, inventory alerts + lowest-margin orders). All numbers trace to seeded data with no invented values. Pure domain helpers carry unit tests; presentational components carry render tests. The direct-render container pattern is preserved.

## Scope

### In scope

- **Layer 1 — KPI header (5 tiles)** with period comparison (last 10 days vs prior 10) and trend arrow:
  - Ventas (USD) — Σ `totalUSD`
  - Margen (USD) + % — `totalUSD − costo − comisión`
  - Pedidos + ticket promedio (AOV) — count + average order value
  - Comisión pendiente (MN) — Σ unpaid `commissionMN`
  - Cobrado vs pendiente — delivered/paid vs in-transit
- **Layer 2 — 4 visuals:**
  - Tendencia de ventas 20 días with a **cantidad ↔ valor** toggle
  - Pedidos por etapa — a **distribution** across `creado → verificado → transportando → entregado → comision_pagada`, labeled honestly as distribution (NOT a conversion funnel)
  - Ventas por almacén — bars
  - Mix por moneda / método de pago — dona (USD / MN / ZELLE / EUR)
- **Layer 3 — 3 actionable blocks:**
  - Ranking de gestores — ventas + AOV + comisión devengada/pendiente
  - Top productos por MARGEN (not by revenue)
  - Alertas de inventario (bajo/agotado por almacén) + **pedidos de menor margen** (ascending ranking, reusing `buildProfitabilityRanking`)
- New pure domain helpers (one per aggregation) with unit tests, alongside the existing `buildProfitabilityRanking`.
- New presentational components under `app/components/decisiones/`, each with render tests.
- Rework of `app/routes/decisiones.tsx` to compose the three layers while keeping the direct-render container pattern.

### Out of scope

- **Meta de ventas / sales target** — explicitly dropped. No compliance gauge, no vs-objective semáforo.
- **Costo de transporte por entrega** — belongs to Finanzas, not Decisiones.
- Any commission/cash-flow accounting scope owned by `finanzas.ts` — do not duplicate it.
- Any new data model, seed change, or persisted field beyond what `SeedState` already exposes. The ZELLE/EUR seed diversity is already committed; this change **consumes** it.
- Mutation affordances — the screen stays read-only (no `<Form>`, action, loader, or `useNavigate`).

## Approach

Mirror the existing salesops screen architecture 1:1: a thin direct-render route container that computes its view model once from `loadSeedState()` via pure domain helpers, then hands typed view models to leaf presentational components. This is the same shape as `inventario.tsx` and the current `decisiones.tsx`.

| Decision | Rationale |
|----------|-----------|
| One pure domain helper per aggregation (KPIs, trend, stage distribution, warehouse sales, currency mix, gestor ranking, top-margin products, inventory alerts) | Keeps each aggregation unit-testable in isolation; matches `buildProfitabilityRanking` / `buildFinanceSummary` / `buildInventorySummary` granularity. Strict TDD is active. |
| Reuse `buildProfitabilityRanking` for lowest-margin orders | The helper already produces margin-sorted rows; the block only needs the ascending tail. No new logic, no duplication. |
| Keep the direct-render container (local `useState`, no RR7 Form/loader/`useNavigate`) | Preserves the deliberate sidestep of the jsdom+undici `AbortSignal` gotcha documented in the route. The screen is read-only, so no router affordance is needed. |
| Period comparison = last 10 days vs prior 10 | Uses the ~20-day timestamped seed window; matches the design doc and the Shopify/Lightspeed pattern. Derived from state timestamps already on `Order`. |
| Formatting/locale only at leaf render | Consistent with existing helpers: domain helpers stay pure and numeric; presentational components format. |
| Orders-by-stage labeled "Pedidos por etapa" (distribution) | Honest labeling — the seed is a snapshot of where orders sit, not a cohort conversion. Prevents misleading funnel semantics. |
| Lowest-margin (not "loss-making") orders | Cost is fixed at 60%, so no order is ever negative. Ascending margin ranking is the truthful framing. |

### Open architectural decision to FLAG (for the DESIGN phase — do NOT decide here)

**There is no chart library installed.** The two existing dashboards (`decisiones`, `finanzas`) were built with tables and cards only. This change is the first to introduce real charts (trend area, bars, dona). The design phase must choose the rendering strategy. At a high level the options are:

- **Lightweight inline SVG / CSS** — zero new dependency, full control, more hand-written code, must build accessibility and responsiveness ourselves.
- **A React chart library (e.g. Recharts)** — faster to rich visuals, new dependency + bundle cost, must verify it renders/tests cleanly under the project's jsdom test environment.

Naming the tradeoff only — the choice belongs to `sdd-design`.

## Constraints to honor

- 100% real seeded data; no new data model beyond existing `SeedState`.
- Strict TDD is active: pure domain helpers with unit tests + presentational components with render tests.
- Preserve the direct-render container pattern (no `<Form>`, loader, action, or `useNavigate`).
- Do not reopen locked decisions (no sales target, transport out of scope, seed diversity already done, lowest-margin replaces loss-making).

## Next step

Run `sdd-spec` and `sdd-design` (they can proceed in parallel). `sdd-design` owns the chart-rendering decision flagged above.
