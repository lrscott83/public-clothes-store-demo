# Delta for salesops-mvp — Task 11 (Pantalla: Dashboard de Finanzas)

Replaces the 4-KPI commission card + single state table with a 3-layer
financial panel (5 KPI tiles, 4 visuals, 3 actionable blocks).
`buildFinanceSummary` is reused unchanged.

## Locked constraints (do not reopen in review)

- No revenue/cash target, gauge, or vs-meta semáforo.
- No Gross/Net/Fees/discounts/refunds — only `totalUSD`/`totalMN` per order.
- "Cobrado" is a STATE proxy (`entregado`/`comision_pagada`), never a
  cash-received event; distinct from "comisión pagada" (`commissionPaidAt`)
  — copy MUST NOT conflate them.
- All MN aggregates filter `state !== 'creado'` and coalesce `?? 0`; MN↔USD
  conversion uses each order's own frozen `exchangeRateSnapshot.usdToMn`,
  never live `state.exchangeRates`.
- Read-only: no `<Form>`, loader, action, or `useNavigate`.

## MODIFIED Requirements

### Requirement: Finanzas Route Renders the Three-Layer Finance Dashboard

The `/finanzas` route MUST render a direct-render container (no `<Form>`,
loader, or `useNavigate`) loading `SeedState` via `loadSeedState`, computing
view models via pure helpers (composing `buildFinanceSummary` unchanged),
and rendering top to bottom: Layer 1 (5 KPI tiles), Layer 2 (4 visuals),
Layer 3 (3 blocks). Exactly one `<h1>` MUST render; no other heading MUST
contain "finanzas".
(Previously: a 4-KPI card + single breakdown table.)

#### Scenario: All three layers render for qualifying orders

- GIVEN `SeedState` has an order in state `verificado` or later
- WHEN `/finanzas` renders
- THEN exactly one `<h1>` renders, and all 5 Layer-1 tiles, 4 Layer-2
  visuals, and 3 Layer-3 blocks render

### Requirement: Empty State When No Qualifying Orders Exist

With zero qualifying orders (`state !== 'creado'`), the route MUST still
render one `<h1>` plus an empty-state message, MUST NOT fabricate
non-zero-looking data for Layer 1/2 or the gestor/warehouse blocks. Layer
3's "Flujo por estado" is exempt (counts every state including `creado`,
and MAY show real zero rows).
(Previously: rendered all-zero KPIs + a full zero table, no empty-state
message.)

#### Scenario: Zero qualifying orders shows a message, not fabricated data

- GIVEN `SeedState.orders` contains only `creado` orders
- WHEN `/finanzas` renders
- THEN the `<h1>` still renders, an empty-state message replaces Layer 1/2
  and the gestor/warehouse blocks, and nothing throws

### Requirement: Money Formatting for Finanzas

Every USD figure across all layers MUST render via a formatter matching
`^\$[\d,]+\.\d{2}$`. Every MN figure MUST render as plain `` `${value} MN` ``
text (no thousands separators), never through the USD formatter, and MUST show
`0 MN` (never `NaN`) when source orders are absent.
(Previously: MN rendered as raw unformatted text; only one MN metric
existed.)

#### Scenario: MN never renders NaN

- GIVEN only `creado` orders (undefined `totalMN`/`commissionMN`)
- WHEN an MN tile renders
- THEN it shows `0 MN`, never `NaN`

### Requirement: Finanzas Read-Only Screen With No Mutation Affordance

Across all three layers, `/finanzas` MUST expose no control mutating
`SeedState`: no `<form>`, no store-mutating button, no "marcar comisión
pagada" action. A local view-only toggle (e.g. cash-flow cobrado/pendiente)
is permitted.
(Previously: same constraint, scoped to one KPI card + table.)

#### Scenario: No form or mutating button renders

- GIVEN `/finanzas` renders with any mix of order states
- WHEN inspected
- THEN no `<form>` and no store-mutating button exist

## REMOVED Requirements

### Requirement: No Gross Revenue-USD KPI Card

(Reason: Layer 1's first tile, "Ingresos facturados (USD)", reintroduces
top-line revenue; the old constraint no longer applies with a dedicated
KPI header.)

## ADDED Requirements

### Requirement: Layer 1 KPI Header Has Exactly Five Tiles With Period Trend

Layer 1 MUST render five tiles, each computed for the current 10-day
window vs the prior 10-day window (anchored to `SeedState.generatedAt`,
never the wall clock) with a trend indicator:

| Tile | Formula |
|---|---|
| Ingresos facturados (USD) | `Σ totalUSD`, qualifying |
| Ingresos liquidados (MN) | `Σ totalMN`, qualifying |
| Cobrado vs pendiente (USD) | `Σ totalUSD`, `entregado`/`comision_pagada` vs `verificado`/`transportando` |
| Comisión pendiente (MN) | `buildFinanceSummary.kpis.commissionPendingMN` |
| Margen neto (USD) + % | `totalUSD − costoUSD − comisiónUSD`, aggregated |

A `0`-prior / `>0`-current window MUST trend "up" (never `Infinity`).

#### Scenario: Five tiles render with a safe trend

- GIVEN qualifying orders in both windows, one tile with prior `0` /
  current `> 0`
- WHEN Layer 1 computes
- THEN all 5 tiles render in order, and that tile shows "up", never
  `Infinity`

### Requirement: Layer 2 Renders Four Financial Visuals

| Visual | Field(s) |
|---|---|
| Tendencia de cobros (20d, toggle cobrado/pendiente) | `totalUSD` by day, split cobrado/pendiente |
| Comisión pagada vs pendiente (dona) | `commissionPaidMN` / `commissionPendingMN` |
| Ingresos por estado (barras) | `FinanceStateRow.revenueUSD` per state |
| Mix por moneda (dona) | `buildCurrencyExposure` revenue+percent per `payment.method` (hard-currency vs local-currency FX exposure) |

Every day in the 20-day window MUST appear, including days at `0`.

#### Scenario: A zero-activity day still appears

- GIVEN one day in the 20-day window has no qualifying orders
- WHEN the trend builds
- THEN that day appears at `0`, not omitted

#### Scenario: Toggling the trend does not touch SeedState

- GIVEN the trend shows "cobrado"
- WHEN toggled to "pendiente"
- THEN the series switches without re-reading or mutating `SeedState`

### Requirement: Layer 3 Renders Three Actionable Finance Blocks

| Block | Field(s) |
|---|---|
| Comisión y ROI por gestor | `buildGestorRanking`; derived pagada = earned − pending; take-rate = commission ÷ revenue |
| Cobros pendientes por almacén | `totalUSD` by `warehouseId`, cobrado/pendiente |
| Flujo por estado | existing `StateBreakdownTable`, unchanged |

A gestor/warehouse with zero qualifying orders MUST still appear at `0`,
not be omitted.

#### Scenario: Zero-order gestor and warehouse still appear

- GIVEN a gestor and a warehouse with no qualifying orders
- WHEN Layer 3 computes
- THEN both appear with all values at `0`

### Requirement: Finance Data Derives Only From Seeded Data and Each Order's Frozen Rate

Every `/finanzas` figure MUST derive from `SeedState` alone. MN↔USD
conversion MUST use each order's own frozen `exchangeRateSnapshot.usdToMn`,
never live `state.exchangeRates`. Every MN aggregate MUST filter
`state !== 'creado'` and coalesce `?? 0`.

#### Scenario: A later live-rate edit does not change an already-computed figure

- GIVEN a `verificado` order with `exchangeRateSnapshot.usdToMn: 40`
- AND `state.exchangeRates.usdToMn` is later edited to `45`
- WHEN the aggregation touching that order rebuilds
- THEN it still uses `40`, not `45`

#### Scenario: A creado order never produces NaN

- GIVEN a `creado` order with undefined `totalMN`/`commissionMN`
- WHEN any MN aggregate builds
- THEN that order contributes `0`, never `NaN`

## Out of Scope

- Revenue/cash target, gauge, vs-meta semáforo.
- Gross/Net/Fees/discounts/refunds model.
- Real cash ledger — "cobrado" stays a state proxy.
- Changes to `buildFinanceSummary`, `buildProfitabilityRanking`, or
  chart-primitive shapes.
- Mutation affordances.
